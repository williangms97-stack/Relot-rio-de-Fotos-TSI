/* ==========================================================================
   Histórico de alterações (auditoria)
   Toda mudança relevante gera um evento: quem, quando, o quê, valor anterior e novo.
   Eventos nunca são editados nem apagados.
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var util = TSI.util;

  var ROTULO_ACAO = {
    criacao: 'Criação',
    edicao: 'Edição',
    importacao: 'Importação',
    atualizacao: 'Atualização pela planilha',
    cancelamento: 'Cancelamento',
    desconsideracao: 'Desconsideração',
    reversao: 'Reversão',
    anulacao: 'Anulação',
    ativacao: 'Ativação',
    desativacao: 'Desativação',
    senha: 'Redefinição de senha'
  };
  var ROTULO_ENTIDADE = {
    ordem: 'Ordem',
    registro: 'Registro',
    maquina: 'Máquina',
    usuario: 'Usuário',
    importacao: 'Importação'
  };

  function texto(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return util.fmtNum(v, 4);
    return String(v);
  }

  /** Monta um evento pronto para gravar. */
  function evento(d) {
    var u = d.usuario || (TSI.auth && TSI.auth.usuario()) || {};
    return {
      id: util.uuid(),
      dataHora: d.dataHora || util.agora(),
      usuarioId: u.id || null,
      usuarioNome: u.nome || 'Sistema',
      entidade: d.entidade,
      entidadeId: String(d.entidadeId),
      entidadeChave: d.entidade + ':' + d.entidadeId,
      rotulo: d.rotulo || '',
      acao: d.acao,
      campo: d.campo || null,
      valorAnterior: texto(d.valorAnterior),
      valorNovo: texto(d.valorNovo),
      motivo: d.motivo ? util.limpar(d.motivo) : null
    };
  }

  /** Converte eventos em operações para TSI.repo.lote(). */
  function operacoes(eventos) {
    return eventos.map(function (e) { return { colecao: 'historico', tipo: 'inserir', valor: e }; });
  }

  function ordenar(lista) {
    return lista.sort(function (a, b) { return a.dataHora < b.dataHora ? 1 : a.dataHora > b.dataHora ? -1 : 0; });
  }

  TSI.historico = {
    ROTULO_ACAO: ROTULO_ACAO,
    ROTULO_ENTIDADE: ROTULO_ENTIDADE,
    evento: evento,
    operacoes: operacoes,
    listar: function () { return TSI.repo.historico.listar().then(ordenar); },
    daEntidade: function (entidade, id) {
      return TSI.repo.historico.porIndice('entidadeChave', entidade + ':' + id).then(ordenar);
    }
  };
})(window);
