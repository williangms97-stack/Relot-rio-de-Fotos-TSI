# Relatório Fotográfico de TSI

Registro fotográfico do Tratamento Industrial de Sementes (TSI) da Dois Marcos Sementes: conferência da ordem de tratamento do RQ70, quantidade efetivamente tratada, máquina utilizada e fotografia da amostra, com relatório PDF "Inspeção de Sementes Tratadas" para cada ordem.

- **Aplicativo (celular):** https://williangms97-stack.github.io/Relot-rio-de-Fotos-TSI/tsi-dois-marcos/
- **Painel:** https://williangms97-stack.github.io/Relot-rio-de-Fotos-TSI/tsi-dois-marcos/painel.html

## Arquivos

- `tsi-dois-marcos/index.html` — aplicativo do operador: pesquisa da ordem de TSI, conferência dos dados do RQ70, quantidade tratada com justificativa de divergência, máquina, fotografia da amostra e protocolo.
- `tsi-dois-marcos/painel.html` — painel do administrador: indicadores e cobertura fotográfica, registros, ordens pendentes/canceladas/desconsideradas, importação do RQ70, máquinas, usuários, histórico de alterações e PDF de cada ordem.
- `tsi-dois-marcos/js/servicos/` — regras compartilhadas: importação do RQ70, ordens, registros, verificação da foto, relatório PDF e fila de sincronização.
- `tsi-dois-marcos/js/ui/` — telas do aplicativo (`operador.js`) e do painel (`adm/`).
- `tsi-dois-marcos/js/core/` — configuração, banco local (IndexedDB) e camada de repositório.
- `tsi-dois-marcos/sw.js` e `manifest.webmanifest` — instalação na tela inicial do celular e uso sem internet.
- `tsi-dois-marcos/vendor/` — SheetJS (leitura do Excel) e jsPDF (geração do PDF).
- `tsi-dois-marcos/js/core/servidor.js` — endereço e chave pública do Supabase (em branco = dados só no aparelho).
- `tsi-dois-marcos/js/servicos/nuvem.js` — ligação com o Supabase: login, sincronização e envio das fotos.
- `supabase/01_estrutura.sql` — banco de dados no Supabase: tabelas, regras de acesso, funções `tsi_*` e bucket `tsi-fotos`.
- `supabase/functions/tsi-usuarios/` — Edge Function para o administrador criar usuários e redefinir senhas.
- `supabase/LEIA-ME.md` — passo a passo para ligar o Supabase.
- `tsi-dois-marcos/docs/ARQUITETURA.md` — camadas, dados e funcionamento com o servidor central.
- `tsi-dois-marcos/docs/CONTEXTO-DO-PROJETO.md` — decisões, situação atual e próximos passos (ponto de partida para continuar o trabalho).

## Situação

Versão 1.1: banco central no Supabase. O celular continua funcionando sem internet e envia os registros quando a conexão volta; o painel recebe os registros de todos os aparelhos. Para ligar, siga `supabase/LEIA-ME.md`.
