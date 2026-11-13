# Relatório Fotográfico de TSI — Dois Marcos Sementes

Protótipo funcional (etapa 1) para registrar, guardar, consultar e gerar relatórios fotográficos
do Tratamento Industrial de Sementes (TSI).

- **App do operador (celular):** pesquisa a ordem de TSI, confere os dados do RQ70, informa a
  quantidade tratada (com justificativa quando difere da prevista), seleciona a máquina, fotografa a
  amostra e envia. Gera protocolo e PDF.
- **Painel do administrador (desktop):** importa a planilha RQ70, acompanha registros e pendências,
  cancela/desconsidera ordens, corrige e anula registros com auditoria, cadastra máquinas e usuários
  e gera o PDF "Inspeção de Sementes Tratadas" de cada ordem.

Feito em HTML, CSS e JavaScript puros, sem etapa de compilação.

## Como abrir

| Forma | Para quê | Como |
|---|---|---|
| Duplo clique em `index.html` | Teste rápido no computador (Chrome ou Edge) | Abra o arquivo. Tudo funciona, exceto instalação como app e uso offline |
| Servidor local | Desenvolvimento | Na pasta do projeto: `npx serve` ou `python -m http.server 8080` e abra `http://localhost:8080` |
| Hospedagem com HTTPS | Uso no celular, instalação na tela inicial e funcionamento sem internet | Publique a pasta inteira em qualquer hospedagem de arquivos estáticos (servidor interno, Netlify, Vercel, GitHub Pages, Supabase Storage etc.) |

No celular, com o endereço HTTPS aberto no Chrome (Android) ou Safari (iOS), use
"Adicionar à tela inicial" para instalar o app.

## Acessos iniciais

| Perfil | Usuário | Senha |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Operador | `operador` | `tsi123` |

Redefina as senhas em **Usuários** (ou desative o operador de demonstração). Enquanto as senhas de
fábrica estiverem ativas, a tela de acesso mostra um quadro lembrando disso.

## Roteiro de demonstração

1. Entre como **Administrador** e abra **Importar RQ70**. Informe a cultura (ex.: Soja) e selecione a
   planilha. Confira a pré-visualização e confirme.
2. Em **Ordens**, filtre "Solicitada até" a data de implantação, selecione todas as do filtro e use
   **Desconsiderar** — assim a cobertura fotográfica passa a medir só as ordens que devem ter foto.
3. Clique em **App do operador** (ou entre com o usuário operador no celular). Digite uma ordem
   pendente, siga as cinco etapas e envie.
4. Volte ao painel: o registro aparece em **Registros** e no **Painel**. Abra o registro e clique em
   **GERAR PDF**.
5. Experimente **Corrigir** e **Anular** no registro e veja as alterações em **Histórico**.

## O que esta etapa faz e o que ainda não faz

**Os dados ficam no aparelho.** Ordens, registros e fotografias são gravados no IndexedDB do
navegador em uso. Não há servidor central nesta etapa: o que é registrado em um celular não aparece
em outro aparelho, e por isso todo registro permanece como "Aguardando envio". Nada é marcado como
sincronizado sem um envio real. A fila de sincronização e a camada de repositório já estão prontas
para receber o banco central (Supabase) — ver `docs/ARQUITETURA.md`.

**O acesso é demonstrativo.** Usuário e senha são conferidos no próprio navegador. Serve para separar
perfis e identificar quem fez cada registro, mas não é segurança de produção.

**A planilha RQ70 fornecida é pesada.** O arquivo tem 7,5 MB porque a aba guarda formatação em mais de
16 mil colunas (64 MB por dentro). A leitura leva de 3 a 10 segundos e usa bastante memória; faça a
importação no computador. Limpar a formatação das colunas vazias no Excel resolve na origem.

**A cultura não vem do RQ70.** A planilha não tem coluna de cultura; o valor é informado na tela de
importação e alimenta o filtro e o gráfico por cultura.

**A verificação da foto é básica.** Confere se o arquivo é uma imagem válida, se tem conteúdo, a
resolução mínima (800×600), a iluminação e a nitidez por medidas simples de pixels. Iluminação e
nitidez geram avisos, não bloqueiam. Não há inteligência artificial; existe um ponto de extensão para
ligar um serviço de visão computacional depois.

## Regras implementadas

- A **ordem de TSI** (coluna U) é a chave. A ordem de reembalagem (coluna T) é só informativa.
- Colunas identificadas pelo cabeçalho (linha "Data | Armazém | … | Ordem de TSI"), com a linha de
  blocos acima (REEMBALAGEM / TSI) decidindo as colunas de nome repetido. Se um cabeçalho não for
  reconhecido, vale a posição padrão A–V.
- Reimportar a planilha atualiza ordens existentes sem tocar nos registros fotográficos; cada campo
  alterado vai para o histórico.
- Linhas sem ordem de TSI e ordens repetidas na planilha são apontadas e não entram.
- Uma ordem aceita um único registro válido (índice único no banco). Registro anulado pelo ADM
  continua guardado e libera a ordem para novo registro.
- Quantidade diferente da prevista exige motivo; "Outros" exige descrição.
- Big Bag: a quantidade prevista já vem preenchida para confirmar ou corrigir. Sacaria: o operador
  digita a quantidade.
- Operador não edita nem exclui registro enviado. Correção, anulação, cancelamento e
  desconsideração são do ADM, sempre com motivo e histórico (campo, valor anterior, novo valor,
  responsável, data e horário).
- Cobertura fotográfica = registradas ÷ (importadas − canceladas − desconsideradas) × 100.

## Estrutura do projeto

```
index.html                 página única (login, app do operador e painel)
manifest.webmanifest       instalação como app (PWA)
sw.js                      funcionamento sem internet
css/                       estilos e fontes locais
js/core/                   configuração, utilitários, IndexedDB e repositório
js/servicos/               regras de negócio (ordens, importação, registros, PDF, fila…)
js/ui/                     telas: acesso, operador e painel (js/ui/adm)
vendor/                    SheetJS 0.20.3 e jsPDF 4.2.1 (com as licenças)
assets/                    logomarca oficial, ícones e fontes
ferramentas/               gerar-recursos.js (embute logomarca e fontes do PDF)
docs/ARQUITETURA.md        camadas, dados e como ligar o banco central
```

Parâmetros de negócio (motivos de divergência, limites da foto, máquinas e usuários iniciais) ficam
em `js/core/config.js`.

## Bibliotecas

| Biblioteca | Versão | Licença | Uso |
|---|---|---|---|
| SheetJS Community Edition | 0.20.3 | Apache-2.0 | Leitura de .xlsx e .xls |
| jsPDF | 4.2.1 | MIT | Geração do PDF |
| Barlow / Barlow Condensed | — | SIL OFL 1.1 | Fontes da interface e do PDF |

O SheetJS deixou de publicar no npm; a versão 0.20.3 desta pasta veio do pacote `@e965/xlsx`, que
espelha a distribuição oficial. Para conferir ou atualizar, o arquivo oficial é
`https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` (basta substituir
`vendor/xlsx.full.min.js`).

## Próxima etapa

Ligar o **Supabase** como banco central: tabelas, armazenamento das fotografias, login real e envio
automático da fila, para que os registros dos celulares apareçam no painel. O caminho está descrito em
`docs/ARQUITETURA.md`.
