# Arquitetura

## Camadas

```
js/ui/         Telas. Montam HTML, tratam cliques e chamam os serviços.
   │
js/servicos/   Regras de negócio. Validam, decidem e descrevem o que gravar.
   │
TSI.repo       Repositório. Única porta de entrada dos dados (contrato abaixo).
   │
js/core/db.js  IndexedDB do aparelho (somente o repositório local conhece).
```

As telas nunca acessam o banco. Os serviços nunca acessam o IndexedDB: usam `TSI.repo`. Trocar o
armazenamento é trocar o objeto `TSI.repo`.

## Contrato do repositório

Todos os métodos devolvem `Promise`.

```
repo.<colecao>.listar()                    -> Array
repo.<colecao>.obter(chave)                -> objeto | undefined
repo.<colecao>.porIndice(indice, valor)    -> Array
repo.<colecao>.umPorIndice(indice, valor)  -> objeto | undefined
repo.<colecao>.contar()                    -> número
repo.<colecao>.salvar(objeto)              -> insere ou substitui
repo.<colecao>.inserir(objeto)             -> falha se a chave ou índice único já existir
repo.<colecao>.remover(chave)
repo.lote([{ colecao, tipo: 'salvar'|'inserir'|'remover', valor|chave }])   -> tudo ou nada
repo.erroDeDuplicidade(erro)               -> true quando a falha foi de unicidade
repo.iniciar()
```

`repo.lote` é o ponto que exige atenção em um banco remoto: é ele que garante, por exemplo, que o
registro, as fotografias, o item da fila e o evento de auditoria sejam gravados juntos.

## Dados

| Coleção | Chave | Conteúdo |
|---|---|---|
| `ordens` | `chave` | Um lote do RQ70 (22 campos), `cultura`, `classeEmbalagem`, datas de importação |
| `ordensInativas` | `chave` | Situação vigente: cancelada ou desconsiderada, motivo, responsável, data |
| `importacoes` | `id` | Arquivo, aba, responsável, data, resumo e colunas identificadas |
| `importacoesLinhas` | `importacaoId` | Todas as linhas lidas naquela importação |
| `registros` | `id` | Registro fotográfico: cópia dos dados da ordem, quantidades, justificativa, máquina, operador, protocolo, situação de envio, correção e anulação |
| `fotos` | `id` | Imagem JPEG (até 1600 px desde a 1.3; antes 2000 px), miniatura, dimensões, data da captura e resultado da verificação |
| `historico` | `id` | Eventos de auditoria (nunca alterados nem apagados) |
| `filaSincronizacao` | `id` | Itens a enviar ao servidor: operação, situação, tentativas, erro |
| `usuarios` | `id` | Nome, usuário, perfil, situação, senha (hash com sal — demonstrativo) |
| `maquinas` | `id` | Identificação e situação |
| `rascunhos` | `usuarioId` | Registro em andamento do operador, inclusive fotografias |

**Chave do lote (desde a versão 1.2).** Cada linha do RQ70 é um lote a fotografar:
`"<ordem>|<LOTE>"` quando há ordem de TSI (uma ordem pode ter vários lotes) e `"SEM|<LOTE>|<data>"`
quando não há (o mesmo lote repetido na mesma data ganha `#2`, `#3`…). A chave nunca muda; quando a
ordem de um lote sem ordem aparece num RQ novo, ela é gravada em `ordemTsi` e a chave continua a mesma.
Lote "-" ou vazio conta como sem lote. Regras em `js/servicos/ordens.js` e `js/servicos/importacao.js`.
O registro guarda `chaveOrdem` (o lote) e `ordemTsi` (só para exibir; pode ser vazio).

Índice único `registros.chaveOrdemAtiva`: vale a chave do lote enquanto o registro é válido e passa
a `anulado:<id>` quando o ADM anula. É o que impede dois registros válidos para o mesmo lote.

**Cultura.** O RQ70 não tem coluna de cultura: `importacao.js` pontua sinais do conteúdo (tecnologia
da cultivar I2X/IPRO/VIP3/PRO4…, peneira "P1 5,5" / "C3C" / "P1 P0", embalagem, tratamento). Sem
vencedor, vale a cultura já aprendida para a mesma cultivar e, depois, a cultura única do arquivo.
O resto fica "não identificada" para o ADM escolher na pré-visualização.

O registro guarda uma cópia dos dados da ordem no momento do envio. Se a planilha mudar depois, o
relatório daquele registro não muda.

## Onde está cada regra

| Regra | Arquivo |
|---|---|
| Identificação das colunas, leitura e comparação da planilha | `js/servicos/importacao.js` |
| Situação da ordem, cancelar, desconsiderar, reverter, cobertura | `js/servicos/ordens.js` |
| Criação, correção e anulação de registros; rascunho | `js/servicos/registros.js` |
| Verificação e preparo da fotografia | `js/servicos/imagem.js` |
| Relatório PDF | `js/servicos/pdf.js` |
| Fila de envio | `js/servicos/sincronizacao.js` |
| Auditoria | `js/servicos/historico.js` |
| Acesso e perfis | `js/servicos/auth.js`, `js/servicos/usuarios.js` |

As permissões são conferidas nos serviços (`TSI.auth.exigirAdm()`), não só escondidas na tela.

## Servidor central (Supabase)

Ligado quando `js/core/servidor.js` tem URL e chave pública. Instalação: `supabase/LEIA-ME.md`
(na raiz do repositório). Em branco, o sistema funciona só com os dados do aparelho.

`js/servicos/nuvem.js` substitui, na inicialização, as peças que dependem de onde os dados estão,
sem mudar telas nem regras:

| Peça | Sem servidor | Com Supabase |
|---|---|---|
| `TSI.repo` | IndexedDB | Lê do IndexedDB (cópia local); `lote()` do ADM vai antes ao servidor (`tsi_lote`) |
| `TSI.auth` | usuário e senha no navegador | Supabase Auth (`usuario` → `usuario@DOMINIO_LOGIN`) + perfil em `tsi_perfis` |
| `TSI.usuarios` | coleção local | Edge Function `tsi-usuarios` (criar, editar, senha, situação) |
| Fila de envio | sem adaptador (aguardando) | fotos para o Storage + `tsi_criar_registro` |
| Fotos de outros aparelhos | — | baixadas do Storage quando abertas (detalhe, PDF) e guardadas |

Sincronização: `tsi_puxar` devolve, por coleção, o que mudou depois de um ponto (data de atualização
+ id, em páginas de 500). O aparelho guarda o ponto por coleção e revisita os 2 minutos anteriores
para pegar gravações que terminaram fora de ordem. Roda ao entrar, ao voltar a conexão, ao voltar à
aba e a cada `INTERVALO_SINCRONIA` segundos. Operador não baixa histórico nem importações, recebe só
as próprias fotos e a miniatura só dos próprios registros.

No servidor, cada tabela guarda o documento do sistema em `dados` (jsonb) com colunas geradas para
chaves e índices (`tsi_registros.chave_ordem_ativa` é única). O navegador não tem acesso direto às
tabelas: só às funções `tsi_*` (security definer), que conferem perfil e situação. Histórico não pode
ser alterado nem apagado; registros não podem ser apagados (anulação é uma alteração).

Conflito: se dois aparelhos registram o mesmo lote sem internet, o servidor aceita o primeiro;
o outro fica como "Falha no envio" no aparelho, com `chaveOrdemAtiva = conflito:<id>`, e não é
reenviado. Registro feito por outro usuário no mesmo aparelho espera esse usuário entrar de novo.

Testes: a etapa foi testada com a biblioteca supabase-js real contra um servidor que simula Auth,
PostgREST, Storage e Edge Functions sobre Postgres (PGlite) com o mesmo `01_estrutura.sql`:
dois aparelhos, importação, registro com foto, painel, PDF, correção, offline, conflito,
cancelamento e desativação de usuário.

## Visão computacional (futuro)

`TSI.imagem.registrarAnalisador(fn)` recebe a imagem já preparada e o resultado da verificação básica.
O que `fn` devolver fica guardado em `verificacao.analiseExterna` junto da fotografia. Nenhum
analisador é registrado nesta versão.

## PWA e atualização

`sw.js` guarda os arquivos do sistema no aparelho e responde com a cópia guardada, buscando a versão
nova em segundo plano. Ao publicar uma atualização, altere `VERSAO` em `sw.js` para renovar tudo de
uma vez. Os dados (IndexedDB) não são afetados.

A logomarca e as fontes do PDF ficam embutidas em `js/core/recursos.js` e
`js/servicos/pdf-fontes.js`. Depois de trocar `assets/logo-dois-marcos.png`, rode
`node ferramentas/gerar-recursos.js`.

## Evolução do banco local

Para mudar o esquema do IndexedDB, aumente `BANCO.VERSAO` em `js/core/config.js` e acrescente um
bloco `if (versaoAnterior < N)` em `js/core/db.js`. Blocos antigos não devem ser alterados.
