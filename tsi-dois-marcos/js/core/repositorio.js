/* ==========================================================================
   Repositório — a única porta de entrada dos dados
   --------------------------------------------------------------------------
   As telas e as regras de negócio (js/servicos) só conversam com TSI.repo.
   Nesta versão, TSI.repo é o RepositorioLocal (IndexedDB do aparelho).

   Para ligar um banco central (PostgreSQL, Supabase, Firebase, API própria),
   crie outro objeto com o MESMO contrato e atribua a TSI.repo antes de
   TSI.app.iniciar() — nenhuma tela ou serviço precisa ser reescrito.
   Veja docs/ARQUITETURA.md.

   CONTRATO (todos os métodos devolvem Promise):
     repo.<colecao>.listar()                 -> Array
     repo.<colecao>.obter(chave)             -> objeto | undefined
     repo.<colecao>.porIndice(indice, valor) -> Array
     repo.<colecao>.umPorIndice(indice, v)   -> objeto | undefined
     repo.<colecao>.contar()                 -> número
     repo.<colecao>.salvar(objeto)           -> grava (insere ou substitui)
     repo.<colecao>.inserir(objeto)          -> grava; falha se a chave/índice único já existir
     repo.<colecao>.remover(chave)
     repo.lote(operacoes)                    -> várias gravações atômicas (tudo ou nada)
        operacoes: [{ colecao, tipo: 'salvar' | 'inserir' | 'remover', valor | chave }]

   COLEÇÕES: usuarios, maquinas, ordens, ordensInativas, importacoes,
             importacoesLinhas, registros, fotos, historico, filaSincronizacao, rascunhos
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var db = TSI.db;

  /* nome usado pelos serviços -> nome da estrutura no IndexedDB */
  var COLECOES = {
    usuarios: 'usuarios',
    maquinas: 'maquinas',
    ordens: 'ordens',
    ordensInativas: 'ordens_inativas',
    importacoes: 'importacoes',
    importacoesLinhas: 'importacoes_linhas',
    registros: 'registros',
    fotos: 'fotos',
    historico: 'historico',
    filaSincronizacao: 'fila_sincronizacao',
    rascunhos: 'rascunhos'
  };

  function colecao(nome) {
    return {
      listar: function () { return db.ler(nome, function (s) { return s.getAll(); }); },
      obter: function (chave) { return db.ler(nome, function (s) { return s.get(chave); }); },
      porIndice: function (indice, valor) { return db.ler(nome, function (s) { return s.index(indice).getAll(valor); }); },
      umPorIndice: function (indice, valor) { return db.ler(nome, function (s) { return s.index(indice).get(valor); }); },
      contar: function () { return db.ler(nome, function (s) { return s.count(); }); },
      salvar: function (obj) { return db.transacao([nome], 'readwrite', function (st) { st(nome).put(obj); }); },
      inserir: function (obj) { return db.transacao([nome], 'readwrite', function (st) { st(nome).add(obj); }); },
      remover: function (chave) { return db.transacao([nome], 'readwrite', function (st) { st(nome).delete(chave); }); }
    };
  }

  var RepositorioLocal = { tipo: 'local' };
  Object.keys(COLECOES).forEach(function (k) { RepositorioLocal[k] = colecao(COLECOES[k]); });

  /** Gravações atômicas: ou todas acontecem, ou nenhuma. */
  RepositorioLocal.lote = function (operacoes) {
    if (!operacoes || !operacoes.length) return Promise.resolve();
    var nomes = [];
    operacoes.forEach(function (o) {
      var n = COLECOES[o.colecao];
      if (!n) throw new Error('Coleção desconhecida: ' + o.colecao);
      if (nomes.indexOf(n) < 0) nomes.push(n);
    });
    return db.transacao(nomes, 'readwrite', function (store) {
      operacoes.forEach(function (o) {
        var s = store(COLECOES[o.colecao]);
        if (o.tipo === 'inserir') s.add(o.valor);
        else if (o.tipo === 'salvar') s.put(o.valor);
        else if (o.tipo === 'remover') s.delete(o.chave);
        else throw new Error('Operação desconhecida: ' + o.tipo);
      });
    });
  };

  /** true quando o erro veio de chave/índice único duplicado */
  RepositorioLocal.erroDeDuplicidade = function (e) {
    return !!e && (e.name === 'ConstraintError' || e.codigo === 'DUPLICIDADE');
  };

  RepositorioLocal.iniciar = function () { return db.abrir(); };

  TSI.RepositorioLocal = RepositorioLocal;
  TSI.repo = RepositorioLocal;
})(window);
