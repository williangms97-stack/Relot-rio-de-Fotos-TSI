/* ==========================================================================
   Ordens de tratamento (base importada do RQ70)
   Cada linha do RQ70 é um LOTE a fotografar, identificado pela "chave":
   - com ordem de TSI (coluna U):  "<ordem>|<LOTE>"   (uma ordem pode ter mais de um lote);
   - sem ordem de TSI:             "SEM|<LOTE>|<data da solicitação>"
     (o mesmo lote pode ser tratado mais de uma vez sem ordem; se o mesmo lote aparece
     mais de uma vez na mesma data, a 2ª linha ganha "#2", a 3ª "#3"…).
   A chave nunca muda depois de criada; se a ordem for informada depois, ela é
   gravada em "ordemTsi" e a chave continua a mesma.
   A ordem de reembalagem (coluna T) é apenas informativa.
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

  /** Número de ordem válido: só algarismos (traço, "N/A" etc. contam como sem ordem). */
  function ordemValida(v) {
    var n = normalizarNumero(v);
    return /^\d+$/.test(n) ? n : '';
  }

  /** Lote sem espaços e em maiúsculas (base da chave e da pesquisa). */
  function normalizarLote(v) {
    var s = v === null || v === undefined ? '' : String(v).replace(/\s+/g, '').toUpperCase();
    return /^([-–—.]*|N\/?A|N\/?D)$/.test(s) ? '' : s;   // "-", "N/A" etc. = sem lote
  }

  /** Chave de identificação de uma linha do RQ70 (ver o topo do arquivo). */
  function montarChave(o) {
    var ordem = ordemValida(o.ordemTsi), lote = normalizarLote(o.lote);
    if (ordem) return ordem + '|' + lote;
    if (!lote) return '';
    return 'SEM|' + lote + '|' + (o.data || o.dataTexto || '');
  }
  function chaveDe(o) { return (o && o.chave) || (o ? montarChave(o) : ''); }

  /** Número da ordem para exibir: o número ou "Sem ordem". */
  function numeroOrdem(x) { return (x && x.ordemTsi) || 'Sem ordem'; }

  /** Identificação curta para títulos: "Ordem 5339 · Lote DM24AA4005" ou "Lote VV26JN0523 (sem ordem)". */
  function rotulo(x, o) {
    o = o || (x && x.ordem && typeof x.ordem === 'object' ? x.ordem : x) || {};
    var lote = o.lote || (x && x.lote) || '';
    if (x && x.ordemTsi) return 'Ordem ' + x.ordemTsi + (lote ? ' · Lote ' + lote : '');
    return 'Lote ' + (lote || '—') + ' (sem ordem)';
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

  /** Junta ordens, situação vigente e registro ativo em uma única visão (um item por lote). */
  function visao() {
    return Promise.all([repo().ordens.listar(), repo().ordensInativas.listar(), repo().registros.listar()]).then(function (r) {
      var inativas = {}, registros = {};
      r[1].forEach(function (i) { inativas[chaveDe(i)] = i; });
      r[2].forEach(function (reg) {
        if (!reg.anulado && !/^(conflito|substituido):/.test(reg.chaveOrdemAtiva || '')) registros[reg.chaveOrdem || reg.chaveOrdemAtiva] = reg;
      });
      return r[0].map(function (o) { return item(o, registros[chaveDe(o)], inativas[chaveDe(o)]); })
        .sort(function (a, b) {
          return util.compararNatural(b.ordem.ordemTsi || '', a.ordem.ordemTsi || '') ||
            String(b.ordem.data || '').localeCompare(String(a.ordem.data || '')) || util.compararNatural(a.ordem.lote || '', b.ordem.lote || '');
        });
    });
  }

  function item(o, reg, inat) {
    reg = reg || null; inat = inat || null;
    return { chave: chaveDe(o), ordem: o, registro: reg, inativacao: inat, situacao: reg ? SIT.REGISTRADA : inat ? inat.situacao : SIT.PENDENTE };
  }

  /** Indicadores do painel (contados por lote). Canceladas e desconsideradas ficam fora da cobertura. */
  function indicadores(itens) {
    var c = { importadas: itens.length, registradas: 0, pendentes: 0, canceladas: 0, desconsideradas: 0, semOrdem: 0 };
    itens.forEach(function (i) {
      if (!i.ordem.ordemTsi) c.semOrdem++;
      if (i.situacao === SIT.REGISTRADA) c.registradas++;
      else if (i.situacao === SIT.CANCELADA) c.canceladas++;
      else if (i.situacao === SIT.DESCONSIDERADA) c.desconsideradas++;
      else c.pendentes++;
    });
    c.elegiveis = c.importadas - c.canceladas - c.desconsideradas;
    c.cobertura = c.elegiveis > 0 ? (c.registradas / c.elegiveis) * 100 : null;
    return c;
  }

  /** Situação de um lote pela chave (rascunho, registro). */
  function consultarChave(chave) {
    if (!chave) return Promise.resolve(null);
    return Promise.all([
      repo().ordens.obter(chave),
      repo().ordensInativas.obter(chave),
      repo().registros.umPorIndice('chaveOrdemAtiva', chave)
    ]).then(function (r) { return r[0] ? item(r[0], r[2], r[1]) : null; });
  }

  /** Pesquisa do operador pelo número da ordem OU pelo lote.
      Devolve todos os lotes encontrados: uma ordem pode ter mais de um lote, e um lote sem
      ordem pode ter sido solicitado mais de uma vez. */
  function consultar(texto) {
    var busca = util.limpar(texto), ordem = ordemValida(busca), lote = normalizarLote(busca);
    if (!busca) return Promise.resolve({ busca: '', itens: [] });
    return repo().ordens.listar().then(function (todas) {
      var achadas = todas.filter(function (o) {
        return (ordem && o.ordemTsi === ordem) || (lote && normalizarLote(o.lote) === lote);
      });
      return Promise.all(achadas.map(function (o) { return consultarChave(chaveDe(o)); }));
    }).then(function (itens) {
      itens = itens.filter(Boolean).sort(function (a, b) {
        var pa = a.situacao === SIT.PENDENTE ? 0 : 1, pb = b.situacao === SIT.PENDENTE ? 0 : 1;
        return (pa - pb) || String(b.ordem.data || '').localeCompare(String(a.ordem.data || '')) ||
          util.compararNatural(a.ordem.lote || '', b.ordem.lote || '');
      });
      return { busca: busca, itens: itens };
    });
  }

  /** Cancela ou desconsidera lotes (somente ADM, motivo obrigatório). "chaves" = chaves dos lotes. */
  function inativar(chaves, tipo, motivo) {
    var adm = TSI.auth.exigirAdm();
    if (tipo !== SIT.CANCELADA && tipo !== SIT.DESCONSIDERADA) throw Erro('Situação inválida.');
    var m = util.limpar(motivo);
    if (m.length < 5) throw Erro('Informe o motivo (mínimo de 5 caracteres).');
    return visao().then(function (itens) {
      var mapa = {}, ops = [], evs = [], ignoradas = [], agora = util.agora();
      itens.forEach(function (i) { mapa[i.chave] = i; });
      chaves.forEach(function (k) {
        var i = mapa[k];
        if (!i) { ignoradas.push({ chave: k, motivo: 'Ordem não encontrada.' }); return; }
        if (i.situacao === SIT.REGISTRADA) { ignoradas.push({ chave: k, motivo: 'Já possui registro fotográfico. Anule o registro antes.' }); return; }
        if (i.situacao === tipo) { ignoradas.push({ chave: k, motivo: 'Já está nesta situação.' }); return; }
        ops.push({ colecao: 'ordensInativas', tipo: 'salvar', valor: {
          chave: k, ordemTsi: i.ordem.ordemTsi || null, lote: i.ordem.lote || null,
          situacao: tipo, motivo: m, usuarioId: adm.id, usuarioNome: adm.nome, dataHora: agora } });
        evs.push(H().evento({ entidade: 'ordem', entidadeId: k, rotulo: rotulo(i.ordem), dataHora: agora,
          acao: tipo === SIT.CANCELADA ? 'cancelamento' : 'desconsideracao', campo: 'Situação',
          valorAnterior: cfg.ROTULO_SITUACAO_ORDEM[i.situacao], valorNovo: cfg.ROTULO_SITUACAO_ORDEM[tipo], motivo: m }));
      });
      return repo().lote(ops.concat(H().operacoes(evs))).then(function () {
        if (ops.length) TSI.eventos.emitir('ordens:alterado');
        return { aplicadas: ops.length, ignoradas: ignoradas };
      });
    });
  }

  /** Devolve lotes cancelados/desconsiderados à situação "Pendente", mantendo o histórico. */
  function reverter(chaves, motivo) {
    TSI.auth.exigirAdm();
    var m = util.limpar(motivo);
    return repo().ordensInativas.listar().then(function (lista) {
      var mapa = {}, ops = [], evs = [], agora = util.agora();
      lista.forEach(function (i) { mapa[chaveDe(i)] = i; });
      chaves.forEach(function (k) {
        var i = mapa[k];
        if (!i) return;
        ops.push({ colecao: 'ordensInativas', tipo: 'remover', chave: k });
        evs.push(H().evento({ entidade: 'ordem', entidadeId: k, rotulo: rotulo(i), dataHora: agora, acao: 'reversao', campo: 'Situação',
          valorAnterior: cfg.ROTULO_SITUACAO_ORDEM[i.situacao], valorNovo: cfg.ROTULO_SITUACAO_ORDEM[SIT.PENDENTE], motivo: m || null }));
      });
      return repo().lote(ops.concat(H().operacoes(evs))).then(function () {
        if (ops.length) TSI.eventos.emitir('ordens:alterado');
        return { aplicadas: ops.length };
      });
    });
  }

  /** Histórico de um lote: eventos pela chave e, para ordens importadas antes da versão 1.2, pelo número da ordem. */
  function historicoDe(o) {
    var chave = chaveDe(o);
    var buscas = [TSI.historico.daEntidade('ordem', chave)];
    if (o.ordemTsi && o.ordemTsi !== chave) buscas.push(TSI.historico.daEntidade('ordem', o.ordemTsi));
    return Promise.all(buscas).then(function (r) {
      var vistos = {}, todos = [];
      [].concat.apply([], r).forEach(function (e) { if (!vistos[e.id]) { vistos[e.id] = true; todos.push(e); } });
      return todos.sort(function (a, b) { return a.dataHora < b.dataHora ? 1 : a.dataHora > b.dataHora ? -1 : 0; });
    });
  }

  TSI.ordens = {
    CAMPOS: CAMPOS,
    CAMPO: CAMPO,
    ROTULO_CLASSE: ROTULO_CLASSE,
    normalizarNumero: normalizarNumero,
    ordemValida: ordemValida,
    normalizarLote: normalizarLote,
    montarChave: montarChave,
    chaveDe: chaveDe,
    numeroOrdem: numeroOrdem,
    rotulo: rotulo,
    classificarEmbalagem: classificarEmbalagem,
    unidade: unidade,
    qtdPrevista: qtdPrevista,
    fmtCampo: fmtCampo,
    fmtQtd: fmtQtd,
    visao: visao,
    indicadores: indicadores,
    consultar: consultar,
    consultarChave: consultarChave,
    historicoDe: historicoDe,
    obter: function (chave) { return repo().ordens.obter(chave); },
    contar: function () { return repo().ordens.contar(); },
    inativar: inativar,
    reverter: reverter
  };
})(window);
