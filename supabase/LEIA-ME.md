# Ligar o sistema ao Supabase

Passo a passo para colocar o banco central no ar. Leva uns 15 minutos e é feito uma vez só.
Depois disso, o que o operador registra no celular aparece no painel do computador.

Arquivos desta pasta:

| Arquivo | Para quê |
|---|---|
| `01_estrutura.sql` | Tabelas, regras de acesso, funções e o local das fotografias (instalação nova) |
| `02_lotes.sql` | Atualização da versão 1.2: cada linha do RQ70 passa a ser identificada pelo lote. Só para quem instalou o `01` antes de 17/11/2026 |
| `03_espaco.sql` | Versão 1.3: indicador de espaço usado no painel e sinal de vida para o projeto não ser pausado. Rodar uma vez (instalação nova também) |
| `functions/tsi-usuarios/index.ts` | Função que cria usuários e redefine senhas a partir do painel |

## 1. Fechar o cadastro livre

Supabase → **Authentication** → **Sign In / Providers** (em alguns projetos: *Providers* → *Email*):

- deixe o provedor **Email** ligado;
- **desligue "Allow new users to sign up"**.

Assim só o administrador cria acessos (pelo painel do sistema). Mesmo que alguém consiga se cadastrar
por fora, o sistema deixa o usuário inativo, sem acesso a nada.

> Se este projeto do Supabase também é usado por outra aplicação que depende de cadastro livre,
> fale com o responsável antes de desligar.

## 2. Criar as tabelas

Supabase → **SQL Editor** → **New query** → cole o conteúdo inteiro de `01_estrutura.sql` → **Run**.

Deve terminar com "Success. No rows returned". O script pode ser executado de novo sem perder dados
(útil quando sair uma versão nova dele).

> **Já tinha instalado antes de 17/11/2026?** Rode também `02_lotes.sql` uma vez, do mesmo jeito.
> Ele converte as ordens, os registros e as fotos que já existem para o formato da versão 1.2
> (uma ordem pode ter vários lotes; lotes sem ordem também são fotografados). Nada é apagado.

Tudo o que ele cria começa com `tsi_` (tabelas e funções) e o bucket de fotos se chama `tsi-fotos`,
para não se misturar com outras aplicações no mesmo projeto.

## 3. Publicar a função de usuários

Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**:

1. Nome da função: `tsi-usuarios` (exatamente assim).
2. Apague o código de exemplo e cole o conteúdo inteiro de `functions/tsi-usuarios/index.ts`.
3. Clique em **Deploy function**.

A função usa a chave secreta do projeto, que o Supabase já entrega a ela automaticamente
(`SUPABASE_SERVICE_ROLE_KEY`). Essa chave nunca vai para o navegador.

## 4. Criar o primeiro administrador

Supabase → **Authentication** → **Users** → **Add user** → **Create new user**:

- **Email:** `admin@tsi.doismarcos.com.br`
- **Password:** uma senha forte (é a senha do administrador)
- marque **Auto Confirm User**

O primeiro usuário criado vira Administrador automaticamente. No sistema ele entra com o nome de usuário
**admin** (a parte antes do @). Os demais usuários são criados depois, pelo próprio painel, em **Usuários**.

> O domínio `tsi.doismarcos.com.br` é só um identificador interno: ninguém recebe e-mail.
> Ele precisa ser igual ao `DOMINIO_LOGIN` de `js/core/servidor.js`.

## 5. Informar o endereço do banco ao sistema

Supabase → **Project Settings** → **API Keys** (ou **Data API**). Copie:

- **Project URL** — algo como `https://abcdefghijkl.supabase.co`
- a chave **publishable** (`sb_publishable_...`) — em projetos antigos, a **anon public**

No GitHub, abra `tsi-dois-marcos/js/core/servidor.js`, clique no lápis (**Edit this file**) e preencha:

```js
URL: 'https://abcdefghijkl.supabase.co',
CHAVE_PUBLICA: 'sb_publishable_...',
```

Clique em **Commit changes**. Em um ou dois minutos o GitHub Pages publica a versão ligada ao banco.

**Nunca** coloque nesse arquivo a chave **secret** / **service_role**: ela daria acesso total ao banco
a qualquer pessoa que abrisse o site.

## 6. Primeiro uso

1. Abra o **painel** (`.../tsi-dois-marcos/painel.html`) e entre com `admin` e a senha do passo 4.
2. **Importar RQ70**: importe a planilha (as ordens passam a ficar no servidor).
3. **Usuários**: crie os operadores (nome, usuário e senha).
4. No celular, abra o **aplicativo** (`.../tsi-dois-marcos/`) e entre com o usuário do operador.
   O primeiro acesso em cada celular precisa de internet para baixar as ordens; depois ele funciona
   sem conexão e envia os registros quando a internet volta.

Os dados de teste que estavam guardados só no navegador (da etapa anterior) não são levados ao servidor.

## Como o sistema usa o Supabase

- Celular e painel guardam uma cópia dos dados no aparelho e buscam novidades a cada minuto,
  ao entrar e quando a conexão volta. No painel, o botão **Atualizar** busca na hora.
- Registro feito no celular: as fotos vão para o bucket `tsi-fotos` e o registro para o banco.
  O servidor confere a ordem, a máquina e se a ordem já tem registro.
- Se dois aparelhos registrarem a mesma ordem sem internet, vale o primeiro que chegar ao servidor;
  o outro fica como **Falha no envio** no celular, com o motivo, e as fotos continuam guardadas nele.
- Importação, cancelamento, correção e anulação feitas no painel vão direto ao servidor e exigem internet.
- Usuário desativado no painel é desconectado dos aparelhos na próxima atualização e não consegue entrar.

## Se algo der errado

| Sintoma | O que conferir |
|---|---|
| "Usuário ou senha incorretos" no admin | O e-mail no passo 4 termina em `@tsi.doismarcos.com.br`? A senha está certa? |
| "Este usuário não tem acesso ao sistema de TSI" | O passo 2 foi executado **antes** de criar o usuário? Se não, rode o SQL e crie o usuário de novo |
| "Não foi possível falar com a função tsi-usuarios" | A função foi publicada com esse nome exato? Em Edge Functions → tsi-usuarios → Logs aparece o erro |
| Função responde 401 mesmo com o admin conectado | Em Edge Functions → tsi-usuarios → Details, desligue **Verify JWT** (a função já confere o usuário) |
| Fotos não sobem | O bucket `tsi-fotos` existe em Storage? (é criado pelo passo 2) |
| Painel continua dizendo "dados neste aparelho" | `servidor.js` foi salvo com URL e chave? Recarregue a página com Ctrl+F5 |

## Plano do Supabase

Antes de usar em produção, confira em **supabase.com/pricing** os limites do plano escolhido.
Dois pontos pesam neste sistema: projetos gratuitos podem ser **pausados por inatividade**
(a operação de TSI é por safra, com semanas paradas) e as **fotografias ocupam espaço**
(cada foto é guardada com até 2000 px, em torno de 0,3 a 0,8 MB).
