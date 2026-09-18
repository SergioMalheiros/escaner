// Service worker do Simplificando as Entregas.
//
// Por que existe: o app é instalado na tela inicial e usado o dia inteiro na
// rua — inclusive em subsolo, elevador e portaria sem sinal. Sem isto, abrir o
// app sem internet dava tela branca, porque o próprio arquivo do app (e as
// bibliotecas que ele puxa de fora) precisavam ser baixados toda vez. E isso
// era pior do que parece: a fila de fotos pendentes só conseguia reenviar
// enquanto o app estivesse aberto, então se o Android descartasse a aba num
// lugar sem sinal, não tinha nem como reabrir pra tentar de novo — e foto
// pendente é comprovante de entrega.
//
// REGRA DE OURO: nunca trocar a versão do app com ele aberto. Parte da fila de
// fotos vive na memória, e um recarregamento no meio do expediente poderia
// perder comprovante. Por isso aqui NÃO tem skipWaiting: a versão nova fica
// esperando e só assume quando o app for realmente fechado e aberto de novo.

var VERSAO = "se-v1";
var CACHE_APP = VERSAO + "-app";
var CACHE_EXTERNO = VERSAO + "-externo";
var PAGINA = "./index.html";

// Só o essencial pra tela abrir. O zxing_reader.wasm (1,1 MB) fica de fora de
// propósito: ele só serve em iPhone (no Android o navegador já tem leitor
// próprio), então é guardado sozinho na primeira vez que alguém abrir a câmera
// num aparelho que precisa dele — em vez de todo mundo baixar na instalação.
var ESSENCIAL = [PAGINA, "./manifest.json", "./icon192.png", "./icon512.png"];

// Endereços de fora que valem a pena guardar: são os arquivos sem os quais o
// app abre capenga. O resto da internet (envio de foto pro Cloudinary, o canal
// ao vivo do Firebase) passa direto, sem o service worker encostar.
var EXTERNOS_OK = [
  "https://www.gstatic.com/firebasejs/",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/",
  "https://fastly.jsdelivr.net/npm/zxing-wasm@"
];

function ehExternoConhecido(url) {
  for (var i = 0; i < EXTERNOS_OK.length; i++) {
    if (url.indexOf(EXTERNOS_OK[i]) === 0) return true;
  }
  return false;
}

self.addEventListener("install", function (evento) {
  evento.waitUntil(
    caches.open(CACHE_APP).then(function (cache) {
      // Um por um em vez de addAll: o addAll falha inteiro se um único arquivo
      // não vier, e aí o app ficaria SEM cache nenhum por causa de um ícone
      // renomeado. Aqui cada pedra no caminho custa só aquele arquivo.
      return Promise.all(ESSENCIAL.map(function (u) {
        return cache.add(new Request(u, { cache: "reload" })).catch(function () {});
      }));
    })
  );
});

self.addEventListener("activate", function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (n) {
        return n.indexOf(VERSAO) === 0 ? null : caches.delete(n);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Abrir o app: tenta a internet por no máximo 2,5s e, passando disso, abre na
// hora com a versão guardada. Com sinal bom o app está sempre na versão mais
// nova; com sinal ruim ele abre instantâneo em vez de ficar pendurado numa
// tela branca. O download que estourou o tempo continua em segundo plano e
// atualiza o cache pra próxima abertura de qualquer jeito.
// Resposta que chegou depois de um REDIRECIONAMENTO não serve como página do
// app. É o portal de Wi-Fi do galpão (aquele "aceite para conectar"): ele
// responde 200, mas o conteúdo é a página dele, não o app. Guardar isso era
// ruim duas vezes — o app abria mostrando a tela do portal, e devolver uma
// resposta redirecionada numa NAVEGAÇÃO é recusado pelo navegador, então o
// app deixava de abrir offline, que é justamente pra isso que o service
// worker existe (subsolo, elevador, portaria sem sinal).
function serveComoPagina(resp) {
  return !!resp && resp.ok && !resp.redirected;
}

function responderNavegacao(req, cache) {
  var daRede = fetch(req).then(function (resp) {
    if (serveComoPagina(resp)) cache.put(PAGINA, resp.clone()).catch(function () {});
    return resp;
  });
  var prazo = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 2500); });
  return Promise.race([daRede.catch(function () { return null; }), prazo])
    .then(function (resp) {
      if (resp) return resp;
      return cache.match(PAGINA).then(function (guardado) {
        // Uma versão anterior deste service worker pode ter guardado a página
        // do portal antes da checagem acima existir. Se o que está guardado
        // não serve, joga fora e deixa a rede responder — melhor esperar do
        // que abrir a tela errada ou estourar na navegação.
        if (guardado && !serveComoPagina(guardado)) {
          cache.delete(PAGINA).catch(function () {});
          guardado = null;
        }
        // Sem nada guardado ainda (primeiríssima abertura, offline): não tem o
        // que inventar, devolve o que a rede acabar dizendo.
        return guardado || daRede;
      });
    });
}

// Demais arquivos: responde na hora com o que está guardado e revalida por
// baixo. São arquivos que praticamente não mudam (bibliotecas com a versão no
// endereço, ícones), então servir do cache é sempre certo e é o que deixa o
// app abrir rápido.
function responderArquivo(req, cache, evento) {
  return cache.match(req).then(function (guardado) {
    var daRede = fetch(req).then(function (resp) {
      // "opaque" é resposta de outro domínio que não devolve cabeçalho de
      // permissão — não dá pra ler o conteúdo aqui, mas dá pra guardar e o
      // navegador usa normal depois.
      if (resp && (resp.ok || resp.type === "opaque")) cache.put(req, resp.clone()).catch(function () {});
      return resp;
    }).catch(function () { return null; });

    if (guardado) {
      // Mantém o service worker vivo até a revalidação terminar, senão o
      // navegador pode desligá-lo antes de o cache ser atualizado.
      evento.waitUntil(daRede);
      return guardado;
    }
    return daRede.then(function (resp) { return resp || Response.error(); });
  });
}

self.addEventListener("fetch", function (evento) {
  var req = evento.request;
  var url = req.url;
  var mesmaOrigem = url.indexOf(self.location.origin + "/") === 0;

  // O app pergunta por HEAD se o leitor de código está publicado aqui do lado
  // antes de escolher entre o arquivo local e o da internet. Sem sinal essa
  // pergunta falhava e ele escolhia a internet — que também estava fora, e o
  // iPhone ficava sem conseguir bipar. Se o arquivo já está guardado, responde
  // que sim, e ele usa o que temos aqui.
  if (req.method === "HEAD" && mesmaOrigem) {
    evento.respondWith(
      caches.open(CACHE_APP)
        .then(function (cache) { return cache.match(url); })
        .then(function (achou) { return achou ? new Response(null, { status: 200 }) : fetch(req); })
        .catch(function () { return fetch(req); })
    );
    return;
  }

  // Só GET daqui pra baixo. Envio de foto pro Cloudinary (POST) e o canal ao
  // vivo do Firebase passam direto pra rede, intocados.
  if (req.method !== "GET") return;
  if (!mesmaOrigem && !ehExternoConhecido(url)) return;

  evento.respondWith(
    caches.open(mesmaOrigem ? CACHE_APP : CACHE_EXTERNO).then(function (cache) {
      return req.mode === "navigate"
        ? responderNavegacao(req, cache)
        : responderArquivo(req, cache, evento);
    })
  );
});
