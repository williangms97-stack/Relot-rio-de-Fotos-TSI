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
| `ordens` | `ordemTsi` | Linha do RQ70 (22 campos), `cultura`, `classeEmbalagem`, datas de importação |
| `ordensInativas` | `ordemTsi` | Situação vigente: cancelada ou desconsiderada, motivo, responsável, data |
| `importacoes` | `id` | Arquivo, aba, responsável, data, resumo e colunas identificadas |
| `importacoesLinhas` | `importacaoId` | Todas as linhas lidas naquela importação |
| `registros` | `id` | Registro fotográfico: cópia dos dados da ordem, quantidades, justificativa, máquina, operador, protocolo, situação de envio, correção e anulação |
| `fotos` | `id` | Imagem JPEG (até 2000 px), miniatura, dimensões, data da captura e resultado da verificação |
| `historico` | `id` | Eventos de auditoria (nunca alterados nem apagados) |
| `filaSincronizacao` | `id` | Itens a enviar ao servidor: operação, situação, tentativas, erro |
| `usuarios` | `id` | Nome, usuário, perfil, situação, senha (hash com sal — demonstrativo) |
| `maquinas` | `id` | Identificação e situação |
| `rascunhos` | `usuarioId` | Registro em andamento do operador, inclusive fotografias |

Índice único `registros.chaveOrdemAtiva`: vale o número da ordem enquanto o registro é válido e passa
a `anulado:<id>` quando o ADM anula. É o que impede dois registros válidos para a mesma ordem.

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

## Ligação com o Supabase (próxima etapa)

O desenho recomendado mantém o app do operador funcionando sem internet:

1. **Celular grava primeiro no aparelho** (como hoje) e coloca o registro na fila.
2. **A fila envia ao Supabase** quando há conexão. Basta registrar um adaptador:

   ```js
   TSI.sincronizacao.registrarAdaptador({
     enviarRegistro: async function (registro, fotos, item) {
       // 1. envia as fotos ao Storage  2. grava o registro e os eventos nas tabelas
     }
   });
   ```

   A fila já trata tentativas, marca "Sincronizado" ou "Falha no envio" e reprocessa quando a conexão
   volta.
3. **Painel e celulares leem do Supabase** as ordens, máquinas, usuários e registros dos outros
   aparelhos. Para o painel, que trabalha sempre conectado, o caminho mais simples é um
   `RepositorioSupabase` com o mesmo contrato acima atribuído a `TSI.repo`.

Mapa sugerido:

| Hoje (IndexedDB) | Supabase |
|---|---|
| Coleções acima | Tabelas Postgres com os mesmos campos (dados da ordem dentro do registro em `jsonb`) |
| Índice único `chaveOrdemAtiva` | Índice único parcial: `unique (ordem_tsi) where anulado_em is null` |
| `fotos.dados` | Arquivo no Storage (bucket privado); a tabela guarda o caminho e os metadados |
| `repo.lote` | Função SQL (RPC) executada em uma transação |
| Acesso demonstrativo | Supabase Auth + tabela de perfis; regras RLS por perfil |
| Eventos `registros:alterado` | Realtime do Supabase publicando no mesmo barramento `TSI.eventos` |

Os cadastros iniciais têm identificadores fixos (`maquina-linha-01`, `usuario-admin`…) para serem
reconhecidos como os mesmos em todos os aparelhos.

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
