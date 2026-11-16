# Contexto do projeto — para continuar o trabalho

Este arquivo resume tudo o que foi decidido e feito até 13/11/2026, para que uma nova
sessão do Claude (ou outra pessoa) continue de onde parou. Leia junto com
`README.md` e `docs/ARQUITETURA.md`.

## Quem e o quê

- **Responsável:** Willian Gomes Ferreira (Grupo Wehrmann / Dois Marcos Sementes). Conversa em português.
- **Sistema:** relatório fotográfico de TSI (Tratamento Industrial de Sementes).
  - **Aplicativo do operador (celular)** — `tsi-dois-marcos/index.html`
  - **Painel do administrador (computador)** — `tsi-dois-marcos/painel.html`
- **Repositório:** https://github.com/williangms97-stack/Relot-rio-de-Fotos-TSI (público).
  O código fica na pasta `tsi-dois-marcos/`; na raiz ficam `README.md`, `.gitignore` e `.nojekyll`.
- **Endereços (GitHub Pages, depois de ativado em Settings → Pages → main / root):**
  - Aplicativo: https://williangms97-stack.github.io/Relot-rio-de-Fotos-TSI/tsi-dois-marcos/
  - Painel: https://williangms97-stack.github.io/Relot-rio-de-Fotos-TSI/tsi-dois-marcos/painel.html
- **Referência de formato:** o usuário tem outro projeto, *Rastreabilidade LASDM*
  (`williangms97-stack/Rastreabilidade-LASDM`), com `index.html` (celular) e `painel.html`,
  e banco no Supabase (região São Paulo) com funções `api_get` / `api_post`. Ele quer este
  projeto no mesmo padrão de organização.

## Situação atual (etapa 1 — concluída)

Protótipo funcional em HTML, CSS e JavaScript puros, sem compilação. Testado de ponta a ponta
em Chrome automatizado (Playwright) com a planilha RQ70 real.

- Dados no **IndexedDB** do aparelho, atrás de uma camada `TSI.repo` (ver ARQUITETURA.md).
  Ainda **não há servidor central**: cada aparelho vê só os próprios dados, e os registros
  ficam como "Aguardando envio" (nada é marcado como sincronizado sem envio real).
- Acesso **demonstrativo** (usuário e senha conferidos no navegador). Acessos iniciais:
  `admin` / `admin123` e `operador` / `tsi123`.
- **PWA**: `sw.js` guarda os arquivos para uso sem internet; `manifest.webmanifest` permite
  instalar na tela inicial (só no endereço do aplicativo).
- Bibliotecas em `vendor/`: SheetJS 0.20.3 (via pacote npm `@e965/xlsx`, espelho oficial) e
  jsPDF 4.2.1. Fontes Barlow / Barlow Condensed (OFL) locais.

### Planilha RQ70 (fatos verificados no arquivo real)

- Aba `Planilha1`. A linha de blocos (REEMBALAGEM / TSI) está na **linha 9**, o cabeçalho na
  **linha 10** e os dados começam na **linha 11** (o pedido original dizia 9 e 10; a detecção
  automática resolve).
- 1.052 ordens, coluna U (ordem de TSI) sem vazios nem duplicadas; coluna T (reembalagem)
  só em 168 linhas.
- 6 células com erro do Excel (`#REF!`, `#N/A`) — importadas vazias e apontadas na prévia.
- O arquivo tem 7,5 MB porque a formatação ocupa 16.383 colunas; a leitura leva alguns segundos.
- Não existe coluna de cultura: ela é informada na tela de importação.
- **Nunca versionar a planilha real no repositório** (o `.gitignore` bloqueia `*.xlsx`/`*.xls`).

### Decisões já tomadas

- Ordem de TSI (coluna U) é a chave; ordem de reembalagem (T) é só informativa.
- Um registro válido por ordem (índice único `registros.chaveOrdemAtiva`). O ADM pode
  **anular** um registro (com motivo); ele continua guardado e a ordem volta a pendente.
- Divergência de quantidade exige motivo; "Outros" exige descrição. Big Bag: quantidade
  prevista já vem preenchida; Sacaria: o operador digita.
- Cancelar/desconsiderar ordem, corrigir e anular registro: só ADM, com motivo e histórico
  (campo, valor anterior, novo valor, responsável, data/hora).
- Cobertura = registradas ÷ (importadas − canceladas − desconsideradas) × 100.
- Verificação da foto é básica (arquivo válido, não vazia, mínimo 800×600, iluminação e
  nitidez por pixels — gera aviso, não bloqueia). Sem IA; há ponto de extensão
  `TSI.imagem.registrarAnalisador`.
- `index.html` abre só o aplicativo (sem escolha de perfil); `painel.html` só aceita ADM.

## Etapa 2 — Supabase (instalada e ligada em 16/11/2026, versão 1.1.1)

- Projeto Supabase **"Relot-rio-de-Fotos-TSI"** (ref `qxqmsvrqjvzhorjhqpfa`), na **conta corporativa**
  do usuário (organização gratuita). Os outros dois sistemas (LASDM e Antecâmara) ficam em outra conta
  Supabase, a pessoal — são independentes.
- Feito em 16/11: cadastro livre desligado; `01_estrutura.sql` executado; Edge Function `tsi-usuarios`
  publicada com "Verify JWT" desligado; administrador criado como `admin@tsi.doismarcos.com.br`
  (login `admin`); `servidor.js` preenchido. Painel publicado mostra "Conectado ao servidor central".
- Próximos passos do usuário: entrar no painel, importar o RQ70 e criar os operadores.

O código da integração (ver `docs/ARQUITETURA.md`, seção "Servidor central"):

- `supabase/01_estrutura.sql` (raiz do repositório) — rodar no SQL Editor;
- `supabase/functions/tsi-usuarios/index.ts` — publicar como Edge Function `tsi-usuarios`;
- `supabase/LEIA-ME.md` — passo a passo em português;
- `tsi-dois-marcos/js/core/servidor.js` — preencher `URL` e `CHAVE_PUBLICA` (publishable/anon).
  **Nunca** a chave secreta.

Login: nome de usuário convertido em `usuario@tsi.doismarcos.com.br` (`DOMINIO_LOGIN`). O primeiro
usuário criado no painel do Supabase vira ADM. Cadastro livre deve ficar desligado.

Pendências / ideias: conferir limites do plano (pausa por inatividade, espaço das fotos);
Realtime para atualização instantânea (hoje: a cada 60 s e no botão Atualizar); tela para o ADM ver
registros que ficaram em conflito em algum celular.

## Como trabalhar neste repositório

- Rode localmente com `python -m http.server` na pasta `tsi-dois-marcos` (ou abra `painel.html`
  direto no Chrome). Os scripts usam `defer` e não há etapa de build.
- Depois de trocar a logomarca ou as fontes do PDF, rode `node ferramentas/gerar-recursos.js`.
- Ao publicar mudança de arquivos, altere `VERSAO` em `sw.js` (renova o cache dos celulares)
  e `VERSAO` em `js/core/config.js`.
- Ao mudar o esquema do IndexedDB, aumente `BANCO.VERSAO` e acrescente um bloco de migração
  em `js/core/db.js` (nunca alterar blocos antigos).
- Escrever textos de interface e documentação em português, linguagem simples.
