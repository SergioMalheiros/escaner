# Regras de segurança do Realtime Database

> Estas anotações moravam dentro do próprio `database.rules.json`, numa chave `"//"`.
> O console do Firebase **recusa** o arquivo assim (`Expected 'rules' property`), então
> elas saíram de lá: o `.json` agora é JSON puro, pronto pra colar sem editar nada.

Regras de seguranca do Realtime Database do Simplificando as Entregas.

Como publicar: console do Firebase > Realtime Database > aba Regras >
cola o conteúdo de `database.rules.json` > Publicar. (Ou 'firebase deploy --only database' com a CLI.)

ANTES de publicar, o login anonimo precisa estar ligado no console:
Authentication > Sign-in method > Anonymous > Ativar. Sem isso o app
inteiro para de sincronizar, porque toda regra aqui exige auth != null.

O que estas regras garantem:
  1. Ninguem sem credencial le ou escreve nada (antes, em modo teste, o
     banco era publico: nome de quem recebeu, endereco e codigo de
     rastreio de todas as rotas, e qualquer um podia apagar tudo).
  2. Nao da pra listar as rotas existentes. 'lotes' e 'rotas_registradas'
     nao tem .read no no pai, so nos filhos - entao so le quem ja sabe o
     codigo da rota. Isso e o que impede alguem de descobrir uma rota e
     depois ler os dados dela.
  3. Toda foto tem que ser uma URL do Cloudinary. Isso fecha, do lado do
     banco, o caminho de injetar HTML pela URL da foto.
  4. Cor tem que ser hexadecimal de verdade, pelo mesmo motivo: ela vai
     direto pra um style= na tela.
  5. Os dois contadores so podem subir de 1 em 1, entao ninguem zera nem
     inventa um numero.

Limite conhecido e proposital: o codigo da rota continua sendo o segredo
compartilhado entre os colegas - quem tem o codigo tem acesso completo
aquela rota, inclusive pra apagar. Isso espelha como voces trabalham hoje
(o codigo passa de boca em boca). Para ir alem disso seria preciso um dono
por rota e convite de colega, que e um redesenho bem maior.

O no 'pin' guarda o PIN de 4 digitos da rota ja embaralhado, com tempero
proprio - nunca o PIN em si. Vale lembrar que ele e uma tranca do app, nao
destas regras: a conferencia acontece no aparelho, e 4 digitos sao 10 mil
combinacoes. Ele serve pra separar rota de rota entre colegas leigos, nao
pra segurar quem tem conhecimento tecnico. Quem protege de verdade contra
gente de fora sao as regras aqui.

Use codigos de rota longos e nao obvios - eles sao a senha da rota.
