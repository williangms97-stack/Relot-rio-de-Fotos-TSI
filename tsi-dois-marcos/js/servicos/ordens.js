/* ==========================================================================
   Ordens de tratamento (base importada do RQ70)
   A ordem de TSI (coluna U) é a chave de controle da demanda.
   A ordem de reembalagem (coluna T) é apenas informativa e nunca é usada como chave.
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var util = TSI.util, cfg = TSI.config, repo = function () { return TSI.repo; };
  var Erro = function (m) { return TSI.auth.Erro(m); };
  var H = function () { return TSI.historico; };
  var SIT = cfg.SITUACAO_ORDEM;

  /* Campos do RQ70, na ordem das colunas da planilha.
     "coluna" é a posição padrão informada no projeto (usada só quando o cabeçalho não é reconhecido). */
  var CAMPOS = [
    { campo: 'data', rotulo: 'Data da solicitação', curto: 'Data', coluna: 'A', tipo: 'data' },
    { campo: 'armazem', rotulo: 'Armazém', curto: 'Armazém', coluna: 'B', tipo: 'texto' },
    { campo: 'localProducao', rotulo: 'Local de produção', curto: 'Local de produção', coluna: 'C', tipo: 'texto' },
    { campo: 'cultivar', rotulo: 'Cultivar', curto: 'Cultivar', coluna: 'D', tipo: 'texto' },
    { campo: 'lote', rotulo: 'Lote', curto: 'Lote', coluna: 'E', tipo: 'texto' },
    { campo: 'categoria', rotulo: 'Categoria', curto: 'Categoria', coluna: 'F', tipo: 'texto' },
    { campo: 'peneira', rotulo: 'Peneira (mm)', curto: 'Peneira', coluna: 'G', tipo: 'texto' },
    { campo: 'pesoLote', rotulo: 'Peso do lote (kg)', curto: 'Peso do lote', coluna: 'H', tipo: 'numero' },
    { campo: 'pesoEmbOriginal', rotulo: 'Peso por embalagem original (kg)', curto: 'Peso/emb. original', coluna: 'I', tipo: 'numero' },
    { campo: 'qtdEmbInteiras', rotulo: 'Embalagens inteiras (unid.)', curto: 'Emb. inteiras', coluna: 'J', tipo: 'numero' },
    { campo: 'qtdEmbPallet', rotulo: 'Embalagens por pallet', curto: 'Emb./pallet', coluna: 'K', tipo: 'numero' },
    { campo: 'embFracionada', rotulo: 'Embalagem fracionada (kg)', curto: 'Emb. fracionada', coluna: 'L', tipo: 'numero' },
    { campo: 'embalagemOriginal', rotulo: 'Embalagem original', curto: 'Emb. original', coluna: 'M', tipo: 'texto' },
    { campo: 'tipoEmbalagem', rotulo: 'Tipo de embalagem solicitada', curto: 'Tipo de embalagem', coluna: 'N', tipo: 'texto' },
    { campo: 'qtdReembalagem', rotulo: 'Quantidade solicitada para reembalagem (unid.)', curto: 'Qtd. reembalagem', coluna: 'O', tipo: 'numero' },
    { campo: 'pesoEmbReembalagem', rotulo: 'Peso por embalagem de reembalagem (kg)', curto: 'Peso/emb. reemb.', coluna: 'P', tipo: 'numero' },
    { campo: 'qtdTsi', rotulo: 'Quantidade solicitada para TSI (unid.)', curto: 'Qtd. TSI', coluna: 'Q', tipo: 'numero' },
    { campo: 'pesoEmbTsi', rotulo: 'Peso por embalagem de TSI (kg)', curto: 'Peso/emb. TSI', coluna: 'R', tipo: 'numero' },
    { campo: 'tratamento', rotulo: 'Tratamento', curto: 'Tratamento', coluna: 'S', tipo: 'texto' },
    { campo: 'ordemReembalagem', rotulo: 'Ordem de reembalagem', curto: 'Ordem reemb.', coluna: 'T', tipo: 'codigo' },
    { campo: 'ordemTsi', rotulo: 'Ordem de TSI', curto: 'Ordem TSI', coluna: 'U', tipo: 'codigo' },
    { campo: 'observacoes', rotulo: 'Observações', curto: 'Observações', coluna: 'V', tipo: 'texto' }
  ];
  var CAMPO = {};
  CAMPOS.forEach(function (c) { CAMPO[c.campo] = c; });

  /** Normaliza o número da ordem digitado ou lido da planilha: "07889", 7889 e "7889.0" viram "7889". */
  function normalizarNumero(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    var s = util.limpar(v);
    if (/^\d+[.,]0+$/.test(s)) s = s.replace(/[.,]0+$/, '');
    if (/^\d+$/.test(s)) s = s.replace(/^0+(?=\d)/, '');
    return s.toUpperCase();
  }

  /** Classe da embalagem a partir do texto da coluna N: SACARIA, BIG_BAG ou OUTRA. */
  function classificarEmbalagem(texto) {
    var t = util.chave(texto);
    if (!t) return 'OUTRA';
    if (/sacaria|\bsacos?\b|^sc\b/.test(t)) return 'SACARIA';
    if (/big\s*bags?|\bbags?\b/.test(t)) return 'BIG_BAG';
    return 'OUTRA';
  }

  var ROTULO_CLASSE = { SACARIA: 'Sacaria', BIG_BAG: 'Big Bag', OUTRA: 'Outra embalagem' };

  /** Unidade usada para falar da quantidade tratada. Só afirma "sacos" ou "bags"
      quando os dados do RQ70 sustentam isso; caso contrário usa "unidades". */
  function unidade(o) {
    var classe = (o && o.classeEmbalagem) || 'OUTRA';
    var peso = o && typeof o.pesoEmbTsi === 'number' ? o.pesoEmbTsi : null;
    if (classe === 'BIG_BAG') return { singular: 'bag', plural: 'bags', titulo: 'BAGS' };
    if (classe === 'SACARIA' && (peso === null || peso <= 100)) return { singular: 'saco', plural: 'sacos', titulo: 'SACOS' };
    return { singular: 'unidade', plural: 'unidades', titulo: 'UNID.' };
  }

  function qtdPrevista(o) { return o && typeof o.qtdTsi === 'number' ? o.qtdTsi : null; }

  /** Valor de um campo pronto para exibição. */
  function fmtCampo(o, campo) {
    var v = o ? o[campo] : null;
    if (v === null || v === undefined || v === '') {
      if (campo === 'data' && o && o.dataTexto) return o.dataTexto;
      return '—';
    }
    var def = CAMPO[campo];
    if (def && def.tipo === 'data') return util.fmtData(v);
    if (typeof v === 'number') return util.fmtNum(v, 2);
    return String(v);
  }

  function fmtQtd(n, o) {
    if (n === null || n === undefined) return 'Não informada';
    var u = unidade(o);
    return util.fmtNum(n, 2) + ' ' + (n === 1 ? u.singular : u.plural);
  }

  /** Junta ordens, situação vigente e registro ativo em uma única visão. */
  function visao() {
    return Promise.all([repo().ordens.listar(), repo().ordensInativas.listar(), repo().registros.listar()]).then(function (r) {
      var inativas = {}, registros = {};
      r[1].forEach(function (i) { inativas[i.ordemTsi] = i; });
      r[2].forEach(function (reg) { if (!reg.anulado) registros[reg.ordemTsi] = reg; });
      return r[0].map(function (o) {
        var reg = registros[o.ordemTsi] || null, inat = inativas[o.ordemTsi] || null;
        return { ordem: o, registro: reg, inativacao: inat, situacao: reg ? SIT.REGISTRADA : inat ? inat.situacao : SIT.PENDENTE };
      }).sort(function (a, b) { return util.compararNatural(b.ordem.ordemTsi, a.ordem.ordemTsi); });
    });
  }

  /** Indicadores do painel. Canceladas e desconsideradas ficam fora da cobertura. */
  function indicadores(itens) {
    var c = { importadas: itens.length, registradas: 0, pendentes: 0, canceladas: 0, desconsideradas: 0 };
    itens.forEach(function (i) {
      if (i.situacao === SIT.REGISTRADA) c.registradas++;
      else if (i.situacao === SIT.CANCELADA) c.canceladas++;
      else if (i.situacao === SIT.DESCONSIDERADA) c.desconsideradas++;
      else c.pendentes++;
    });
    c.elegiveis = c.importadas - c.canceladas - c.desconsideradas;
    c.cobertura = c.elegiveis > 0 ? (c.registradas / c.elegiveis) * 100 : null;
    return c;
  }

  /** Pesquisa feita pelo operador: devolve a ordem e o que impede (ou não) o registro. */
  function consultar(numeroDigitado) {
    var numero = normalizarNumero(numeroDigitado);
    if (!numero) return Promise.resolve({ numero: '', ordem: null });
    return Promise.all([
      repo().ordens.obter(numero),
      repo().ordensInativas.obter(numero),
      repo().registros.umPorIndice('chaveOrdemAtiva', numero)
    ]).then(function (r) {
      var o = r[0] || null;
      return {
        numero: numero, ordem: o, registro: o ? (r[2] || null) : null, inativacao: o ? (r[1] || null) : null,
        situacao: !o ? null : r[2] ? SIT.REGISTRADA : r[1] ? r[1].situacao : SIT.PENDENTE
      };
    });
  }

  /** Cancela ou desconsidera ordens (somente ADM, motivo obrigatório). */
  function inativar(numeros, tipo, motivo) {
    var adm = TSI.auth.exigirAdm();
    if (tipo !== SIT.CANCELADA && tipo !== SIT.DESCONSIDERADA) throw Erro('Situação inválida.');
    var m = util.limpar(motivo);
    if (m.length < 5) throw Erro('Informe o motivo (mínimo de 5 caracteres).');
    return visao().then(function (itens) {
      var mapa = {}, ops = [], evs = [], ignoradas = [], agora = util.agora();
      itens.forEach(function (i) { mapa[i.ordem.ordemTsi] = i; });
      numeros.forEach(function (n) {
        var i = mapa[n];
        if (!i) { ignoradas.push({ numero: n, motivo: 'Ordem não encontrada.' }); return; }
        if (i.situacao === SIT.REGISTRADA) { ignoradas.push({ numero: n, motivo: 'Já possui registro fotográfico. Anule o registro antes.' }); return; }
        if (i.situacao === tipo) { ignoradas.push({ numero: n, motivo: 'Já está nesta situação.' }); return; }
        ops.push({ colecao: 'ordensInativas', tipo: 'salvar', valor: {
          ordemTsi: n, situacao: tipo, motivo: m, usuarioId: adm.id, usuarioNome: adm.nome, dataHora: agora } });
        evs.push(H().evento({ entidade: 'ordem', entidadeId: n, rotulo: 'Ordem ' + n, dataHora: agora,
          acao: tipo === SIT.CANCELADA ? 'cancelamento' : 'desconsideracao', campo: 'Situação',
          valorAnterior: cfg.ROTULO_SITUACAO_ORDEM[i.situacao], valorNovo: cfg.ROTULO_SITUACAO_ORDEM[tipo], motivo: m }));
      });
      return repo().lote(ops.concat(H().operacoes(evs))).then(function () {
        if (ops.length) TSI.eventos.emitir('ordens:alterado');
        return { aplicadas: ops.length, ignoradas: ignoradas };
      });
    });
  }

  /** Devolve ordens canceladas/desconsideradas à situação "Pendente", mantendo o histórico. */
  function reverter(numeros, motivo) {
    TSI.auth.exigirAdm();
    var m = util.limpar(motivo);
    return repo().ordensInativas.listar().then(function (lista) {
      var mapa = {}, ops = [], evs = [], agora = util.agora();
      lista.forEach(function (i) { mapa[i.ordemTsi] = i; });
      numeros.forEach(function (n) {
        var i = mapa[n];
        if (!i) return;
        ops.push({ colecao: 'ordensInativas', tipo: 'remover', chave: n });
        evs.push(H().evento({ entidade: 'ordem', entidadeId: n, rotulo: 'Ordem ' + n, dataHora: agora, acao: 'reversao', campo: 'Situação',
          valorAnterior: cfg.ROTULO_SITUACAO_ORDEM[i.situacao], valorNovo: cfg.ROTULO_SITUACAO_ORDEM[SIT.PENDENTE], motivo: m || null }));
      });
      return repo().lote(ops.concat(H().operacoes(evs))).then(function () {
        if (ops.length) TSI.eventos.emitir('ordens:alterado');
        return { aplicadas: ops.length };
      });
    });
  }

  TSI.ordens = {
    CAMPOS: CAMPOS,
    CAMPO: CAMPO,
    ROTULO_CLASSE: ROTULO_CLASSE,
    normalizarNumero: normalizarNumero,
    classificarEmbalagem: classificarEmbalagem,
    unidade: unidade,
    qtdPrevista: qtdPrevista,
    fmtCampo: fmtCampo,
    fmtQtd: fmtQtd,
    visao: visao,
    indicadores: indicadores,
    consultar: consultar,
    obter: function (numero) { return repo().ordens.obter(normalizarNumero(numero)); },
    contar: function () { return repo().ordens.contar(); },
    inativar: inativar,
    reverter: reverter
  };
})(window);
