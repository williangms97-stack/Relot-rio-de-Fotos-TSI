/* ==========================================================================
   Máquinas — cadastro administrado pelo ADM
   Máquinas inativas não aparecem para novos registros, mas continuam no histórico.
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var util = TSI.util, cfg = TSI.config, repo = function () { return TSI.repo; };
  var Erro = function (m) { return TSI.auth.Erro(m); };
  var H = function () { return TSI.historico; };

  function nomeValido(nome) {
    var n = util.limpar(nome);
    if (n.length < 2) throw Erro('Informe a identificação da máquina.');
    if (n.length > 40) throw Erro('A identificação deve ter no máximo 40 caracteres.');
    return n;
  }
  function nomeLivre(nome, ignorarId) {
    return repo().maquinas.listar().then(function (l) {
      if (l.some(function (m) { return m.id !== ignorarId && util.chave(m.nome) === util.chave(nome); })) {
        throw Erro('Já existe uma máquina com essa identificação.');
      }
    });
  }

  TSI.maquinas = {
    listar: function () {
      return repo().maquinas.listar().then(function (l) {
        return l.sort(function (a, b) { return util.compararNatural(a.nome, b.nome); });
      });
    },

    listarAtivas: function () {
      return TSI.maquinas.listar().then(function (l) { return l.filter(function (m) { return m.ativa; }); });
    },

    criar: function (nome) {
      var adm = TSI.auth.exigirAdm();
      var n = nomeValido(nome);
      return nomeLivre(n).then(function () {
        var m = { id: util.uuid(), nome: n, ativa: true, criadaEm: util.agora(), criadaPor: adm.nome };
        var ev = H().evento({ entidade: 'maquina', entidadeId: m.id, rotulo: m.nome, acao: 'criacao' });
        return repo().lote([{ colecao: 'maquinas', tipo: 'inserir', valor: m }].concat(H().operacoes([ev])))
          .then(function () { TSI.eventos.emitir('maquinas:alterado'); return m; });
      });
    },

    renomear: function (id, nome) {
      TSI.auth.exigirAdm();
      var n = nomeValido(nome);
      return Promise.all([repo().maquinas.obter(id), nomeLivre(n, id)]).then(function (r) {
        var m = r[0];
        if (!m) throw Erro('Máquina não encontrada.');
        if (m.nome === n) return m;
        var ev = H().evento({ entidade: 'maquina', entidadeId: m.id, rotulo: n, acao: 'edicao', campo: 'Identificação', valorAnterior: m.nome, valorNovo: n });
        m.nome = n;
        return repo().lote([{ colecao: 'maquinas', tipo: 'salvar', valor: m }].concat(H().operacoes([ev])))
          .then(function () { TSI.eventos.emitir('maquinas:alterado'); return m; });
      });
    },

    definirSituacao: function (id, ativa) {
      TSI.auth.exigirAdm();
      return repo().maquinas.obter(id).then(function (m) {
        if (!m) throw Erro('Máquina não encontrada.');
        if (m.ativa === ativa) return m;
        m.ativa = ativa;
        var ev = H().evento({ entidade: 'maquina', entidadeId: m.id, rotulo: m.nome, acao: ativa ? 'ativacao' : 'desativacao',
          campo: 'Situação', valorAnterior: ativa ? 'Inativa' : 'Ativa', valorNovo: ativa ? 'Ativa' : 'Inativa' });
        return repo().lote([{ colecao: 'maquinas', tipo: 'salvar', valor: m }].concat(H().operacoes([ev])))
          .then(function () { TSI.eventos.emitir('maquinas:alterado'); return m; });
      });
    },

    /** Resumo de utilização por máquina: { [id]: { total, ultimoUso } } (registros não anulados) */
    uso: function () {
      return repo().registros.listar().then(function (regs) {
        var mapa = {};
        regs.forEach(function (r) {
          if (r.anulado) return;
          var u = mapa[r.maquinaId] || (mapa[r.maquinaId] = { total: 0, ultimoUso: null });
          u.total++;
          if (!u.ultimoUso || r.criadoEm > u.ultimoUso) u.ultimoUso = r.criadoEm;
        });
        return mapa;
      });
    },

    /** Histórico de utilização: registros feitos na máquina, do mais recente ao mais antigo. */
    registrosDa: function (id) {
      return repo().registros.porIndice('maquinaId', id).then(function (l) {
        return l.sort(function (a, b) { return a.criadoEm < b.criadoEm ? 1 : -1; });
      });
    },

    semear: function () {
      return repo().maquinas.contar().then(function (n) {
        if (n > 0) return;
        return repo().lote(cfg.MAQUINAS_INICIAIS.map(function (m) {
          return { colecao: 'maquinas', tipo: 'inserir', valor: { id: m.id, nome: m.nome, ativa: true, criadaEm: util.agora(), criadaPor: 'Sistema' } };
        }));
      });
    }
  };
})(window);
