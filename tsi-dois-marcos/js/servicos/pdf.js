/* ==========================================================================
   Relatório fotográfico individual (PDF) — "Inspeção de Sementes Tratadas"
   --------------------------------------------------------------------------
   Um PDF por ordem de tratamento, em A4 paisagem, desenhado em vetor com jsPDF:
   textos nítidos em qualquer ampliação e fotografia em alta resolução.
   Página 1: cabeçalho, dados, fotografia principal e divergência (se houver).
   Página 2: fotografias complementares (se houver).
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var util = TSI.util, cfg = TSI.config;
  var Erro = function (m) { return TSI.auth.Erro(m); };

  var PT = 0.3528;                       // 1 pt em mm
  var LARG = 297, ALT = 210, MARGEM = 14;
  var COR = {
    fundo: [236, 239, 234], folhaClara: [248, 250, 247], folhaEscura: [221, 228, 220],
    tinta: [42, 50, 46], tinta2: [78, 90, 84], tinta3: [116, 128, 121], linha: [203, 211, 205],
    branco: [255, 255, 255], sombra: [196, 205, 198],
    verde: [2, 101, 72], amarelo: [246, 216, 42],
    alertaFundo: [253, 246, 214], alertaBorda: [214, 180, 20], anulado: [180, 35, 24]
  };

  /** Mantém apenas caracteres presentes nas fontes embutidas (Latin-1). */
  function t(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-')
      .replace(/…/g, '...').replace(/•/g, '-').replace(/[  ]/g, ' ')
      .replace(/[^ -ÿ]/g, '?');
  }

  function cor(doc, tipo, c) {
    if (tipo === 'texto') doc.setTextColor(c[0], c[1], c[2]);
    else if (tipo === 'fundo') doc.setFillColor(c[0], c[1], c[2]);
    else doc.setDrawColor(c[0], c[1], c[2]);
  }
  function fonte(doc, negrito, tamanho) { doc.setFont('BarlowCondensed', negrito ? 'bold' : 'normal'); doc.setFontSize(tamanho); }
  function opacidade(doc, valor) { doc.setGState(new global.jspdf.GState({ opacity: valor })); }

  function novoDocumento() {
    if (!global.jspdf || !global.jspdf.jsPDF) throw Erro('Biblioteca de PDF não carregada.');
    var doc = new global.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    doc.addFileToVFS('BarlowCondensed-Bold.ttf', TSI.fontesPdf.negrito);
    doc.addFont('BarlowCondensed-Bold.ttf', 'BarlowCondensed', 'bold');
    doc.addFileToVFS('BarlowCondensed-Medium.ttf', TSI.fontesPdf.medio);
    doc.addFont('BarlowCondensed-Medium.ttf', 'BarlowCondensed', 'normal');
    return doc;
  }

  /* ---------- Fundo com folhas discretas (vetor) ---------- */
  function folha(doc, x, y, comprimento, largura, anguloGraus) {
    var a = anguloGraus * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    function rot(px, py) { return [px * c - py * s, px * s + py * c]; }
    var p1 = rot(comprimento * 0.28, -largura), p2 = rot(comprimento * 0.78, -largura * 0.8), ponta = rot(comprimento, 0);
    var p3 = rot(comprimento * 0.78, largura * 0.8), p4 = rot(comprimento * 0.28, largura);
    doc.lines([
      [p1[0], p1[1], p2[0], p2[1], ponta[0], ponta[1]],
      [p3[0] - ponta[0], p3[1] - ponta[1], p4[0] - ponta[0], p4[1] - ponta[1], -ponta[0], -ponta[1]]
    ], x, y, [1, 1], 'F', true);
  }
  function ramo(doc, x, y, anguloGraus, tamanho, corFolha) {
    var a = anguloGraus * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
    cor(doc, 'fundo', corFolha); cor(doc, 'linha', corFolha);
    doc.setLineWidth(0.5 * tamanho);
    doc.line(x, y, x + dx * 44 * tamanho, y + dy * 44 * tamanho);
    for (var i = 0; i < 5; i++) {
      var d = (7 + i * 8) * tamanho, px = x + dx * d, py = y + dy * d, comp = (17 - i * 2) * tamanho, larg = (4.4 - i * 0.5) * tamanho;
      folha(doc, px, py, comp, larg, anguloGraus - 42);
      folha(doc, px, py, comp, larg, anguloGraus + 42);
    }
    folha(doc, x + dx * 44 * tamanho, y + dy * 44 * tamanho, 11 * tamanho, 2.6 * tamanho, anguloGraus);
  }
  function fundo(doc) {
    cor(doc, 'fundo', COR.fundo);
    doc.rect(0, 0, LARG, ALT, 'F');
    doc.saveGraphicsState();
    opacidade(doc, 0.85);
    ramo(doc, -4, 214, -58, 1.25, COR.folhaClara);
    ramo(doc, LARG + 4, 214, -122, 1.25, COR.folhaClara);
    opacidade(doc, 0.7);
    ramo(doc, 22, 216, -78, 0.8, COR.folhaEscura);
    ramo(doc, LARG - 22, 216, -102, 0.8, COR.folhaEscura);
    doc.restoreGraphicsState();
  }

  function logo(doc, largura, y) {
    var altura = largura * TSI.recursos.logoAltura / TSI.recursos.logoLargura;
    doc.addImage(TSI.recursos.logo, 'PNG', LARG - MARGEM - largura, y, largura, altura, 'logo', 'FAST');
    return altura;
  }

  /* ---------- Blocos "RÓTULO: / valor" ---------- */
  function medirBloco(doc, b, largura) {
    fonte(doc, false, b.tamValor);
    var linhas = doc.splitTextToSize(t(b.valor), largura);
    if (linhas.length > 3) { linhas = linhas.slice(0, 3); linhas[2] = linhas[2].replace(/.{0,3}$/, '...'); }
    b.linhas = linhas;
    b.alturaRotulo = b.tamRotulo * PT * 0.86;
    b.alturaLinha = b.tamValor * PT * 1.16;
    b.altura = b.alturaRotulo + 1.6 + linhas.length * b.alturaLinha;
    return b.altura;
  }
  function desenharBloco(doc, b, x, y, largura, centralizado) {
    var cx = centralizado ? x + largura / 2 : x, op = centralizado ? { align: 'center' } : {};
    fonte(doc, true, b.tamRotulo); cor(doc, 'texto', COR.tinta);
    doc.text(t(b.rotulo), cx, y + b.alturaRotulo, op);
    fonte(doc, false, b.tamValor); cor(doc, 'texto', COR.tinta2);
    var yy = y + b.alturaRotulo + 1.6;
    b.linhas.forEach(function (l) { yy += b.alturaLinha; doc.text(l, cx, yy - b.alturaLinha * 0.24, op); });
  }
  function pilha(doc, blocos, x, largura, topo, base, espaco) {
    var total = 0;
    blocos.forEach(function (b) { total += medirBloco(doc, b, largura); });
    total += espaco * (blocos.length - 1);
    var y = topo + Math.max(0, (base - topo - total) / 2);
    blocos.forEach(function (b) { desenharBloco(doc, b, x, y, largura, false); y += b.altura + espaco; });
  }

  /** Moldura branca com a fotografia inteira (sem cortes) dentro da área disponível. */
  function moldura(doc, foto, apelido, x, y, larguraMax, alturaMax, borda) {
    var esc = Math.min((larguraMax - 2 * borda) / foto.largura, (alturaMax - 2 * borda) / foto.altura);
    var w = foto.largura * esc, h = foto.altura * esc;
    var mx = x + (larguraMax - w - 2 * borda) / 2, my = y + (alturaMax - h - 2 * borda) / 2;
    doc.saveGraphicsState();
    opacidade(doc, 0.55);
    cor(doc, 'fundo', COR.sombra);
    doc.roundedRect(mx + 0.9, my + 1.3, w + 2 * borda, h + 2 * borda, borda + 0.8, borda + 0.8, 'F');
    doc.restoreGraphicsState();
    cor(doc, 'fundo', COR.branco);
    doc.roundedRect(mx, my, w + 2 * borda, h + 2 * borda, borda + 0.8, borda + 0.8, 'F');
    doc.addImage(new Uint8Array(foto.dados), 'JPEG', mx + borda, my + borda, w, h, apelido, 'FAST');
    return { x: mx, y: my, largura: w + 2 * borda, altura: h + 2 * borda };
  }

  function rodape(doc, reg, pagina, total, geradoEm) {
    cor(doc, 'linha', COR.linha); doc.setLineWidth(0.2);
    doc.line(MARGEM, 199.5, LARG - MARGEM, 199.5);
    fonte(doc, false, 8.5); cor(doc, 'texto', COR.tinta3);
    var esq = 'Protocolo ' + reg.protocolo + '   |   Registrado em ' + util.fmtDataHora(reg.criadoEm) + ' por ' + reg.operadorNome;
    if (reg.corrigidoEm) esq += '   |   Corrigido pelo ADM em ' + util.fmtDataHora(reg.corrigidoEm);
    doc.text(t(esq), MARGEM, 204.2);
    doc.text(t(cfg.EMPRESA + '   |   Relatório gerado em ' + util.fmtDataHora(geradoEm) + '   |   Página ' + pagina + ' de ' + total), LARG - MARGEM, 204.2, { align: 'right' });
  }

  function marcaAnulado(doc) {
    doc.saveGraphicsState();
    opacidade(doc, 0.3);
    fonte(doc, true, 84); cor(doc, 'texto', COR.anulado);
    doc.text('REGISTRO ANULADO', LARG / 2, ALT / 2 + 22, { align: 'center', angle: 22 });
    doc.restoreGraphicsState();
  }

  function paginaPrincipal(doc, reg, principal) {
    var o = reg.ordem || {}, un = TSI.ordens.unidade(o);
    fundo(doc);

    // Cabeçalho: título centralizado e logomarca oficial à direita
    fonte(doc, true, 31); cor(doc, 'texto', COR.tinta);
    doc.text(t('INSPEÇÃO DE SEMENTES TRATADAS'), LARG / 2, 23.4, { align: 'center' });
    logo(doc, 60, 9.6);

    if (reg.anulado) {
      var aviso = t('REGISTRO ANULADO em ' + util.fmtDataHora(reg.anulado.em) + ' por ' + reg.anulado.porNome + '  |  Motivo: ' + reg.anulado.motivo);
      fonte(doc, true, 10.5);
      aviso = doc.splitTextToSize(aviso, LARG - 2 * MARGEM - 8)[0];
      cor(doc, 'fundo', COR.anulado);
      doc.roundedRect(MARGEM, 28.4, LARG - 2 * MARGEM, 6, 1.6, 1.6, 'F');
      cor(doc, 'texto', COR.branco);
      doc.text(aviso, LARG / 2, 32.6, { align: 'center' });
    }

    // Divergência de quantidade (faixa inferior, só quando existe)
    var base = 194;
    if (reg.divergencia) {
      var dif = reg.qtdEfetiva - reg.qtdPrevista;
      var just = 'Justificativa: ' + (reg.motivoDivergencia || '-') + (reg.descricaoDivergencia ? ' - ' + reg.descricaoDivergencia : '');
      fonte(doc, false, 11.5);
      var lj = doc.splitTextToSize(t(just), LARG - 2 * MARGEM - 10);
      if (lj.length > 3) { lj = lj.slice(0, 3); lj[2] = lj[2].replace(/.{0,3}$/, '...'); }
      var hd = 13.2 + lj.length * 4.9, yd = 195 - hd;
      cor(doc, 'fundo', COR.alertaFundo); cor(doc, 'linha', COR.alertaBorda); doc.setLineWidth(0.3);
      doc.roundedRect(MARGEM, yd, LARG - 2 * MARGEM, hd, 2.4, 2.4, 'FD');
      fonte(doc, true, 12); cor(doc, 'texto', COR.tinta);
      var tituloDiv = t('DIVERGÊNCIA DE QUANTIDADE');
      doc.text(tituloDiv, MARGEM + 5, yd + 6.4);
      var xDados = MARGEM + 5 + doc.getTextWidth(tituloDiv) + 9;
      fonte(doc, false, 12);
      doc.text(t('Prevista (RQ70): ' + TSI.ordens.fmtQtd(reg.qtdPrevista, o) + '      Efetivamente tratada: ' + TSI.ordens.fmtQtd(reg.qtdEfetiva, o) +
        '      Diferença: ' + (dif > 0 ? '+' : '') + util.fmtNum(dif, 2)), xDados, yd + 6.4);
      fonte(doc, false, 11.5); cor(doc, 'texto', COR.tinta2);
      lj.forEach(function (l, i) { doc.text(l, MARGEM + 5, yd + 12 + i * 4.9); });
      base = yd - 5;
    }

    var topo = reg.anulado ? 38 : 35, colEsq = 60, colDir = 60, vao = 6;
    var xFoto = MARGEM + colEsq + vao, wFoto = LARG - 2 * MARGEM - colEsq - colDir - 2 * vao, xDir = LARG - MARGEM - colDir;

    // Coluna esquerda: identificação
    pilha(doc, [
      { rotulo: 'CULTIVAR:', valor: o.cultivar || '-', tamRotulo: 16, tamValor: 14.5 },
      { rotulo: 'LOTE:', valor: o.lote || '-', tamRotulo: 16, tamValor: 14.5 },
      { rotulo: 'ORDEM DE TRATAMENTO:', valor: reg.ordemTsi || 'SEM ORDEM DE TSI', tamRotulo: 16, tamValor: 14.5 },
      { rotulo: 'TRATAMENTO:', valor: o.tratamento || '-', tamRotulo: 16, tamValor: 14.5 },
      { rotulo: 'EMBALAGEM:', valor: o.tipoEmbalagem || '-', tamRotulo: 16, tamValor: 14.5 }
    ], MARGEM, colEsq, topo, base, 6.2);

    // Centro: fotografia principal da amostra
    moldura(doc, principal, 'foto-principal', xFoto, topo, wFoto, base - topo, 3);

    // Coluna direita: quantidade em destaque, máquina, operador e data
    var blocosDir = [
      { rotulo: 'PREVISTA NO RQ70:', valor: TSI.ordens.fmtQtd(reg.qtdPrevista, o), tamRotulo: 12.5, tamValor: 13.5 },
      { rotulo: 'OPERADOR:', valor: reg.operadorNome, tamRotulo: 12.5, tamValor: 13.5 },
      { rotulo: 'DATA E HORÁRIO:', valor: util.fmtDataHora(reg.criadoEm), tamRotulo: 12.5, tamValor: 13.5 }
    ];
    var hBlocos = 0;
    blocosDir.forEach(function (b) { hBlocos += medirBloco(doc, b, colDir); });
    hBlocos += 4.6 * (blocosDir.length - 1);
    var hCaixa = 31, hTopoDir = 16 * PT * 0.86 + 3 + hCaixa + 3.2 + 9.6 + 7;
    var y = topo + Math.max(0, (base - topo - hTopoDir - hBlocos) / 2);

    fonte(doc, true, 16); cor(doc, 'texto', COR.tinta);
    doc.text(t('QUANTIDADE ' + un.titulo + ':'), xDir, y + 16 * PT * 0.86);
    y += 16 * PT * 0.86 + 3;
    cor(doc, 'fundo', COR.branco); cor(doc, 'linha', COR.linha); doc.setLineWidth(0.25);
    doc.roundedRect(xDir, y, colDir, hCaixa, 3, 3, 'FD');
    var qtd = t(util.fmtNum(reg.qtdEfetiva, 2));
    fonte(doc, false, qtd.length > 6 ? 36 : 46); cor(doc, 'texto', COR.tinta);
    doc.text(qtd, xDir + colDir / 2, y + 19.4, { align: 'center' });
    fonte(doc, true, 8.5); cor(doc, 'texto', COR.tinta3);
    doc.text(t('EFETIVAMENTE TRATADA'), xDir + colDir / 2, y + 26.6, { align: 'center', charSpace: 0.25 });
    y += hCaixa + 3.2;
    var tamMaq = 15, nomeMaq = t(reg.maquinaNome);
    fonte(doc, false, tamMaq);
    while (tamMaq > 11 && doc.getTextWidth(nomeMaq) > colDir) { tamMaq -= 0.5; fonte(doc, false, tamMaq); }
    var linhasMaq = doc.splitTextToSize(nomeMaq, colDir).slice(0, 2);
    cor(doc, 'texto', COR.tinta2);
    linhasMaq.forEach(function (l, i) { doc.text(l, xDir + colDir / 2, y + (linhasMaq.length > 1 ? 3.6 : 5.6) + i * 4.8, { align: 'center' }); });
    y += 9.6 + 7;
    blocosDir.forEach(function (b) { desenharBloco(doc, b, xDir, y, colDir, false); y += b.altura + 4.6; });
  }

  function paginaComplementares(doc, reg, fotos) {
    var o = reg.ordem || {};
    doc.addPage('a4', 'landscape');
    fundo(doc);
    fonte(doc, true, 22); cor(doc, 'texto', COR.tinta);
    doc.text(t('FOTOGRAFIAS COMPLEMENTARES'), MARGEM, 18.6);
    fonte(doc, false, 12.5); cor(doc, 'texto', COR.tinta2);
    doc.text(t('Ordem de tratamento ' + (reg.ordemTsi || 'sem ordem') + '   |   Lote ' + (o.lote || '-') + '   |   Cultivar ' + (o.cultivar || '-')), MARGEM, 25.6);
    logo(doc, 46, 9.8);

    var n = fotos.length, colunas = n === 1 ? 1 : n === 2 ? 2 : 3, linhas = Math.ceil(n / colunas);
    var topo = 32, base = 195, vao = 6, legenda = 6;
    var wCel = (LARG - 2 * MARGEM - vao * (colunas - 1)) / colunas, hCel = (base - topo - vao * (linhas - 1)) / linhas;
    fotos.forEach(function (f, i) {
      var cx = MARGEM + (i % colunas) * (wCel + vao), cy = topo + Math.floor(i / colunas) * (hCel + vao);
      var m = moldura(doc, f, 'foto-comp-' + i, cx, cy, wCel, hCel - legenda, 2.2);
      fonte(doc, false, 9.5); cor(doc, 'texto', COR.tinta3);
      doc.text(t('Foto complementar ' + (i + 1) + '   |   ' + util.fmtDataHora(f.capturadaEm)), m.x + m.largura / 2, m.y + m.altura + 4.4, { align: 'center' });
    });
  }

  /** Gera o PDF do registro. Devolve { blob, nome }. */
  function gerar(registroId) {
    return util.exigirBiblioteca('pdf', function () { return !!(global.jspdf && TSI.fontesPdf); }).then(function () {
      return Promise.all([TSI.registros.obter(registroId), TSI.registros.fotosDe(registroId)]);
    }).then(function (r) {
      var reg = r[0], fotos = r[1];
      if (!reg) throw Erro('Registro não encontrado.');
      var principal = fotos.filter(function (f) { return f.principal; })[0] || fotos[0];
      if (!principal) throw Erro('O registro não possui fotografia principal.');
      var complementares = fotos.filter(function (f) { return f !== principal; });

      var doc = novoDocumento(), geradoEm = util.agora(), o = reg.ordem || {};
      doc.setProperties({
        title: t('Inspeção de Sementes Tratadas - ' + TSI.ordens.rotulo(reg)),
        subject: t('Relatório fotográfico de TSI - Lote ' + (o.lote || '') + ' - ' + (o.cultivar || '')),
        author: t(cfg.EMPRESA), creator: t(cfg.NOME_SISTEMA + ' ' + cfg.VERSAO), keywords: t('TSI, ' + reg.protocolo)
      });
      paginaPrincipal(doc, reg, principal);
      if (complementares.length) paginaComplementares(doc, reg, complementares);

      var total = doc.getNumberOfPages();
      for (var p = 1; p <= total; p++) {
        doc.setPage(p);
        if (reg.anulado) marcaAnulado(doc);
        rodape(doc, reg, p, total, geradoEm);
      }
      var nome = util.nomeArquivoSeguro('Inspecao_TSI_' + (reg.ordemTsi ? 'Ordem_' + reg.ordemTsi : 'Sem_Ordem') + (o.lote ? '_Lote_' + o.lote : '')) + '.pdf';
      return { blob: doc.output('blob'), nome: nome };
    });
  }

  TSI.pdf = { gerar: gerar };
})(window);
