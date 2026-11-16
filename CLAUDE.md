# Relatório Fotográfico de TSI

App do operador (`tsi-dois-marcos/index.html`) + painel do administrador (`tsi-dois-marcos/painel.html`)
para registrar as fotos do Tratamento Industrial de Sementes. HTML + JavaScript puro, sem build.
Publicado no GitHub Pages; banco no Supabase (projeto na conta corporativa, ver `servidor.js`).

**Leia `tsi-dois-marcos/docs/CONTEXTO-DO-PROJETO.md` e `tsi-dois-marcos/docs/ARQUITETURA.md`
antes de mudar regras.** Configuração do Supabase: `supabase/LEIA-ME.md`.

## Regras de trabalho

- Ao publicar mudança de arquivos do app, aumente `VERSAO` em `tsi-dois-marcos/sw.js` e em
  `tsi-dois-marcos/js/core/config.js` (mesmo número), senão o celular fica com a versão antiga em cache.
- Mudança de banco = novo arquivo `supabase/0N_*.sql` que possa ser rodado de novo sem apagar dados.
  Tudo com prefixo `tsi_`; bucket `tsi-fotos`. O usuário roda o SQL no painel do Supabase.
- Em `servidor.js` só a chave pública (publishable/anon). Nunca a secret/service_role.
- Login: usuário vira `usuario@tsi.doismarcos.com.br` (`DOMINIO_LOGIN`).
- O app precisa continuar funcionando sem internet (fila local em IndexedDB).
- Nunca versionar a planilha RQ70 real (`.gitignore` bloqueia `*.xlsx`/`*.xls`). Repositório **público**.
- Textos em português, linguagem simples.
- Depois de cada alteração: commit (mensagem em português) e push para o GitHub.
