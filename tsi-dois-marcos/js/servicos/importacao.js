/* ==========================================================================
   Importação da planilha RQ70 (Solicitação de Reembalagem e Tratamento)
   --------------------------------------------------------------------------
   1. ler(arquivo)        lê .xlsx/.xls com SheetJS e identifica as colunas pelo cabeçalho
   2. analisar(leitura)   compara com a base: novas, atualizadas, sem alteração,
                          sem número de TSI e duplicadas na planilha
   3. confirmar(leitura)  grava ordens, importação, linhas lidas e histórico de uma só vez

   A planilha é a fonte dos dados: nada é inventado. Célula vazia ou com erro do
   Excel (#REF!, #N/A) é importada vazia e apontada na pré-visualização.
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var util = TSI.util, cfg = TSI.config, repo = function () { return TSI.repo; };
  var Erro = function (m) { return TSI.auth.Erro(m); };
  var H = function () { return TSI.historico; };
  var O = function () { return TSI.ordens; };
  var IMP = cfg.IMPORTACAO;

  var ERROS_EXCEL = { 0: '#NULL!', 7: '#DIV/0!', 15: '#VALUE!', 23: '#REF!', 29: '#NAME?', 36: '#NUM!', 42: '#N/A', 43: '#GETTING_DATA' };
  var RE_ERRO_TEXTO = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|VALOR!|NOME\?|N\/D)$/i;

  /* Rótulos de cabeçalho reconhecidos (texto sem acentos e sem pontuação).
     "*peso" e "*qtd" se repetem na planilha; o bloco (REEMBALAGEM / TSI) da linha acima decide. */
  var PADROES = [
    { campo: 'ordemTsi', re: /ordem.*\btsi\b/ },
    { campo: 'ordemReembalagem', re: /ordem.*reembalagem/ },
    { campo: 'data', re: /^data\b/ },
    { campo: 'armazem', re: /^armazem/ },
    { campo: 'localProducao', re: /local.*producao/ },
    { campo: 'cultivar', re: /^cultivar/ },
    { campo: 'lote', re: /^lote$/ },
    { campo: 'categoria', re: /^categoria/ },
    { campo: 'peneira', re: /^peneira/ },
    { campo: 'pesoLote', re: /peso.*lote/ },
    { campo: 'qtdEmbInteiras', re: /emb.*inteira/ },
    { campo: 'qtdEmbPallet', re: /emb.*pal+ete?/ },
    { campo: 'embFracionada', re: /fracionada/ },
    { campo: 'embalagemOriginal', re: /^embalagem original/ },
    { campo: 'tipoEmbalagem', re: /tipo.*embalagem/ },
    { campo: 'tratamento', re: /^tratamento$/ },
    { campo: 'observacoes', re: /^observac/ },
    { campo: '*peso', re: /peso por embalagem/ },
    { campo: '*qtd', re: /quant.*solicitada/ }
  ];

  function rotuloChave(v) {
    return util.chave(v === null || v === undefined ? '' : v).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function reconhecer(chave) {
    if (!chave) return null;
    for (var i = 0; i < PADROES.length; i++) if (PADROES[i].re.test(chave)) return PADROES[i].campo;
    return null;
  }

  /** Acesso às células, tanto no formato denso quanto no esparso do SheetJS. */
  function leitorDeCelulas(ws) {
    var XLSX = global.XLSX;
    var dados = ws['!data'] || (Array.isArray(ws) ? ws : null);
    if (dados) return function (r, c) { var linha = dados[r]; return linha ? linha[c] : undefined; };
    return function (r, c) { return ws[XLSX.utils.encode_cell({ r: r, c: c })]; };
  }

  /** Valor bruto de uma célula: { v, erro }. */
  function valorCelula(cel) {
    if (!cel) return { v: null };
    switch (cel.t) {
      case 'n': return { v: typeof cel.v === 'number' && isFinite(cel.v) ? cel.v : null };
      case 's': case 'str': {
        var t = util.limpar(cel.v);
        if (RE_ERRO_TEXTO.test(t)) return { v: null, erro: t.toUpperCase() };
        return { v: t === '' ? null : t };
      }
      case 'b': return { v: cel.v ? 'VERDADEIRO' : 'FALSO' };
      case 'd': return { v: cel.v instanceof Date && !isNaN(cel.v) ? util.dataLocal(cel.v) : null };
      case 'e': return { v: null, erro: cel.w || ERROS_EXCEL[cel.v] || '#ERRO' };
      default: return { v: null };
    }
  }

  /** Procura a linha de cabeçalho e associa cada coluna a um campo do RQ70. */
  function detectarColunas(cel, ultimaLinha, ultimaColuna) {
    var XLSX = global.XLSX;
    var limiteLinhas = Math.min(ultimaLinha, IMP.LINHAS_BUSCA_CABECALHO - 1);
    var melhor = { linha: -1, pontos: 0 };
    var r, c;
    for (r = 0; r <= limiteLinhas; r++) {
      var achados = {};
      for (c = 0; c <= ultimaColuna; c++) {
        var campo = reconhecer(rotuloChave(valorCelula(cel(r, c)).v));
        if (campo) achados[campo] = true;
      }
      var pontos = Object.keys(achados).length;
      if (pontos > melhor.pontos) melhor = { linha: r, pontos: pontos };
    }
    if (melhor.pontos < 5) return null;

    var lin = melhor.linha, mapa = {}, usadas = {}, grupo = '', ocorrPeso = 0, ocorrQtd = 0;
    function atribuir(campo, indice, origem, lido) {
      if (mapa[campo] || usadas[indice]) return;
      mapa[campo] = { campo: campo, indice: indice, coluna: XLSX.utils.encode_col(indice), origem: origem, cabecalhoLido: lido || '' };
      usadas[indice] = true;
    }
    for (c = 0; c <= ultimaColuna; c++) {
      var bruto = valorCelula(cel(lin, c)).v;
      var acima = lin > 0 ? valorCelula(cel(lin - 1, c)).v : null;
      var chaveAcima = rotuloChave(acima);
      if (chaveAcima) grupo = chaveAcima;
      var chave = rotuloChave(bruto), lido = bruto;
      if (!chave && chaveAcima) { chave = chaveAcima; lido = acima; }   // ex.: "Observações" escrito na linha de blocos
      var campoRec = reconhecer(chave);
      if (!campoRec) continue;
      if (campoRec === '*peso') {
        ocorrPeso++;
        campoRec = /\btsi\b/.test(grupo) ? 'pesoEmbTsi' : /reembalagem/.test(grupo) ? 'pesoEmbReembalagem'
          : (!mapa.pesoEmbOriginal ? 'pesoEmbOriginal' : ocorrPeso === 2 ? 'pesoEmbReembalagem' : 'pesoEmbTsi');
      } else if (campoRec === '*qtd') {
        ocorrQtd++;
        campoRec = /\btsi\b/.test(grupo) ? 'qtdTsi' : /reembalagem/.test(grupo) ? 'qtdReembalagem'
          : (ocorrQtd === 1 ? 'qtdReembalagem' : 'qtdTsi');
      }
      atribuir(campoRec, c, 'cabecalho', lido);
    }
    // Campos não reconhecidos pelo cabeçalho: usa a posição padrão do RQ70, se estiver livre
    O().CAMPOS.forEach(function (def) {
      if (!mapa[def.campo]) atribuir(def.campo, XLSX.utils.decode_col(def.coluna), 'posicao', '');
    });
    return { linhaCabecalho: lin, mapa: mapa };
  }

  /** Converte o valor bruto para o tipo do campo. */
  function converter(def, bruto, base1904) {
    if (bruto === null || bruto === undefined) return { v: null };
    if (def.tipo === 'data') {
      if (typeof bruto === 'number') {
        var d = util.serialExcelParaData(bruto, base1904);
        return d ? { v: d } : { v: null, dataTexto: String(bruto) };
      }
      var dt = util.textoParaData(bruto);
      return dt ? { v: dt } : { v: null, dataTexto: String(bruto) };
    }
    if (def.tipo === 'numero') {
      if (typeof bruto === 'number') return { v: bruto };
      if (bruto === '-' || bruto === '–' || bruto === '—') return { v: null };
      var n = util.paraNumero(bruto);
      return { v: n === null ? String(bruto) : n };
    }
    if (def.tipo === 'codigo') return { v: O().normalizarNumero(bruto) || null };
    return { v: typeof bruto === 'number' ? String(bruto).replace('.', ',') : String(bruto) };
  }

  function lerBuffer(arquivo) {
    if (arquivo.arrayBuffer) return arquivo.arrayBuffer();
    return new Promise(function (ok, falha) {
      var fr = new FileReader();
      fr.onload = function () { ok(fr.result); };
      fr.onerror = function () { falha(fr.error); };
      fr.readAsArrayBuffer(arquivo);
    });
  }

  /** Lê a planilha e devolve as linhas já associadas aos campos do RQ70. */
  function ler(arquivo) {
    var nome = arquivo && arquivo.name ? arquivo.name : '';
    if (!IMP.EXTENSOES.some(function (e) { return nome.toLowerCase().slice(-e.length) === e; })) {
      return Promise.reject(Erro('Selecione um arquivo Excel (.xlsx ou .xls).'));
    }
    if (!arquivo.size) return Promise.reject(Erro('O arquivo está vazio.'));

    return util.exigirBiblioteca('planilha', function () { return !!global.XLSX; }).then(function () {
      return lerBuffer(arquivo);
    }).then(function (buffer) {
      var XLSX = global.XLSX;
      if (!XLSX) throw Erro('O leitor de planilhas não foi carregado.');
      var wb;
      try {
        wb = XLSX.read(new Uint8Array(buffer), { type: 'array', dense: true, cellDates: false, cellFormula: false, cellHTML: false, cellText: false, cellStyles: false });
      } catch (e) {
        throw Erro('Não foi possível ler o arquivo. Confirme que é uma planilha Excel válida e que não está protegida por senha.');
      }
      var abas = wb.SheetNames || [];
      if (!abas.length) throw Erro('A planilha não possui abas.');
      var base1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
      var candidatas = abas.slice().sort(function (a, b) {
        return (a === IMP.ABA_PREFERIDA ? -1 : 0) - (b === IMP.ABA_PREFERIDA ? -1 : 0);
      });

      var escolhida = null;
      for (var i = 0; i < candidatas.length && !escolhida; i++) {
        var ws = wb.Sheets[candidatas[i]];
        if (!ws || !ws['!ref']) continue;
        var faixa = XLSX.utils.decode_range(ws['!ref']);
        var ultimaColuna = Math.min(faixa.e.c, IMP.COLUNAS_MAX - 1);
        var cel = leitorDeCelulas(ws);
        var det = detectarColunas(cel, faixa.e.r, ultimaColuna);
        if (det) escolhida = { aba: candidatas[i], cel: cel, ultimaLinha: faixa.e.r, det: det };
      }
      if (!escolhida) {
        throw Erro('Não encontrei o cabeçalho do RQ70 (Cultivar, Lote, Tratamento, Ordem de TSI…) nas primeiras ' +
          IMP.LINHAS_BUSCA_CABECALHO + ' linhas da planilha.');
      }
      if (!escolhida.det.mapa.ordemTsi) throw Erro('A coluna "Ordem de TSI" não foi encontrada na planilha.');

      var mapa = escolhida.det.mapa, campos = O().CAMPOS, linhas = [], celulasComErro = 0;
      for (var r = escolhida.det.linhaCabecalho + 1; r <= escolhida.ultimaLinha; r++) {
        var valores = {}, erros = [], temConteudo = false;
        for (var k = 0; k < campos.length; k++) {
          var def = campos[k], m = mapa[def.campo];
          if (!m) { valores[def.campo] = null; continue; }
          var lido = valorCelula(escolhida.cel(r, m.indice));
          if (lido.erro) { erros.push({ campo: def.campo, rotulo: def.curto, erro: lido.erro }); temConteudo = true; }
          var conv = converter(def, lido.v, base1904);
          valores[def.campo] = conv.v;
          if (conv.dataTexto) valores.dataTexto = conv.dataTexto;
          if (conv.v !== null || conv.dataTexto) temConteudo = true;
        }
        if (!temConteudo) continue;      // linha em branco
        celulasComErro += erros.length;
        linhas.push({ linha: r + 1, valores: valores, erros: erros });
      }

      var mapeamento = campos.map(function (def) {
        var m = mapa[def.campo];
        return { campo: def.campo, rotulo: def.rotulo, coluna: m ? m.coluna : null, origem: m ? m.origem : 'ausente', cabecalhoLido: m ? m.cabecalhoLido : '' };
      });
      var avisos = [];
      if (escolhida.aba !== IMP.ABA_PREFERIDA) avisos.push('A aba "' + IMP.ABA_PREFERIDA + '" não foi encontrada; os dados foram lidos da aba "' + escolhida.aba + '".');
      var porPosicao = mapeamento.filter(function (m) { return m.origem === 'posicao'; });
      if (porPosicao.length) avisos.push('Colunas sem cabeçalho reconhecido, lidas pela posição padrão do RQ70: ' +
        porPosicao.map(function (m) { return m.rotulo + ' (' + m.coluna + ')'; }).join(', ') + '.');
      var ausentes = mapeamento.filter(function (m) { return m.origem === 'ausente'; });
      if (ausentes.length) avisos.push('Colunas não encontradas (ficarão vazias): ' + ausentes.map(function (m) { return m.rotulo; }).join(', ') + '.');
      if (celulasComErro) avisos.push(util.plural(celulasComErro, 'célula com erro do Excel (#REF!, #N/A…) foi importada vazia', 'células com erro do Excel (#REF!, #N/A…) foram importadas vazias') + '.');

      return {
        arquivoNome: nome, arquivoTamanho: arquivo.size, aba: escolhida.aba,
        linhaCabecalho: escolhida.det.linhaCabecalho + 1, primeiraLinhaDados: escolhida.det.linhaCabecalho + 2,
        mapeamento: mapeamento, linhas: linhas, avisos: avisos
      };
    });
  }

  function iguais(a, b) {
    var va = a === undefined || a === '' ? null : a, vb = b === undefined || b === '' ? null : b;
    if (va === null || vb === null) return va === vb;
    if (typeof va === 'number' && typeof vb === 'number') return Math.abs(va - vb) < 1e-9;
    return String(va) === String(vb);
  }

  function montarOrdem(valores, cultura) {
    var o = {};
    O().CAMPOS.forEach(function (def) { o[def.campo] = valores[def.campo] === undefined ? null : valores[def.campo]; });
    o.dataTexto = valores.dataTexto || null;
    o.classeEmbalagem = O().classificarEmbalagem(o.tipoEmbalagem);
    o.cultura = cultura || null;
    return o;
  }

  function diferencas(atual, nova, culturaInformada) {
    var d = [];
    O().CAMPOS.forEach(function (def) {
      if (def.campo === 'ordemTsi') return;
      var de = atual[def.campo], para = nova[def.campo];
      if (def.campo === 'data' && iguais(de, para) && !iguais(atual.dataTexto, nova.dataTexto)) { de = atual.dataTexto; para = nova.dataTexto; }
      if (!iguais(de, para)) d.push({ campo: def.campo, rotulo: def.rotulo, de: O().fmtCampo(atual, def.campo), para: O().fmtCampo(nova, def.campo) });
    });
    if (culturaInformada && !iguais(atual.cultura, culturaInformada)) {
      d.push({ campo: 'cultura', rotulo: 'Cultura', de: atual.cultura || '—', para: culturaInformada });
    }
    return d;
  }

  /** Classifica cada linha lida em relação à base atual. Não grava nada. */
  function analisar(leitura, cultura) {
    var cult = util.limpar(cultura) || null;
    return repo().ordens.listar().then(function (existentes) {
      var mapa = {}, vistos = {};
      existentes.forEach(function (o) { mapa[o.ordemTsi] = o; });
      var resumo = { lidas: leitura.linhas.length, novas: 0, atualizadas: 0, inalteradas: 0, semTsi: 0, duplicadas: 0 };
      var itens = leitura.linhas.map(function (l) {
        var numero = l.valores.ordemTsi;
        var item = { linha: l.linha, ordemTsi: numero || null, valores: l.valores, erros: l.erros, ordem: null, diferencas: [], situacao: '' };
        if (!numero) { item.situacao = 'sem_tsi'; resumo.semTsi++; return item; }
        if (vistos[numero]) { item.situacao = 'duplicada'; item.primeiraLinha = vistos[numero]; resumo.duplicadas++; return item; }
        vistos[numero] = l.linha;
        item.ordem = montarOrdem(l.valores, cult);
        var atual = mapa[numero];
        if (!atual) { item.situacao = 'nova'; resumo.novas++; return item; }
        item.diferencas = diferencas(atual, item.ordem, cult);
        if (item.diferencas.length) { item.situacao = 'atualizada'; resumo.atualizadas++; }
        else { item.situacao = 'inalterada'; resumo.inalteradas++; }
        item.atual = atual;
        return item;
      });
      return { cultura: cult, resumo: resumo, itens: itens };
    });
  }

  /** Grava a importação. Ordens existentes são atualizadas sem tocar nos registros fotográficos. */
  function confirmar(leitura, cultura) {
    var adm = TSI.auth.exigirAdm();
    return analisar(leitura, cultura).then(function (an) {
      var agora = util.agora(), id = util.uuid(), ops = [], evs = [];
      an.itens.forEach(function (it) {
        if (it.situacao === 'nova') {
          var nova = it.ordem;
          nova.criadoEm = agora; nova.atualizadoEm = agora; nova.importacaoId = id; nova.ultimaImportacaoId = id; nova.linhaPlanilha = it.linha;
          ops.push({ colecao: 'ordens', tipo: 'salvar', valor: nova });
        } else if (it.situacao === 'atualizada') {
          var o = it.atual, dados = it.ordem;
          O().CAMPOS.forEach(function (def) { o[def.campo] = dados[def.campo]; });
          o.dataTexto = dados.dataTexto;
          o.classeEmbalagem = dados.classeEmbalagem;
          if (an.cultura) o.cultura = an.cultura;
          o.atualizadoEm = agora; o.ultimaImportacaoId = id; o.linhaPlanilha = it.linha;
          ops.push({ colecao: 'ordens', tipo: 'salvar', valor: o });
          it.diferencas.forEach(function (d) {
            evs.push(H().evento({ entidade: 'ordem', entidadeId: it.ordemTsi, rotulo: 'Ordem ' + it.ordemTsi, acao: 'atualizacao',
              campo: d.rotulo, valorAnterior: d.de === '—' ? null : d.de, valorNovo: d.para === '—' ? null : d.para,
              motivo: 'Planilha ' + leitura.arquivoNome, dataHora: agora }));
          });
        }
      });

      var importacao = {
        id: id, dataHora: agora, usuarioId: adm.id, usuarioNome: adm.nome,
        arquivoNome: leitura.arquivoNome, arquivoTamanho: leitura.arquivoTamanho, aba: leitura.aba,
        linhaCabecalho: leitura.linhaCabecalho, cultura: an.cultura, resumo: an.resumo,
        mapeamento: leitura.mapeamento, avisos: leitura.avisos
      };
      var campos = O().CAMPOS.map(function (c) { return c.campo; });
      var linhas = {
        importacaoId: id,
        campos: campos,
        linhas: an.itens.map(function (it) {
          return { linha: it.linha, situacao: it.situacao, dataTexto: it.valores.dataTexto || null,
            erros: it.erros.length ? it.erros : undefined,
            v: campos.map(function (c) { return it.valores[c] === undefined ? null : it.valores[c]; }) };
        })
      };
      var r = an.resumo;
      evs.push(H().evento({ entidade: 'importacao', entidadeId: id, rotulo: 'Planilha ' + leitura.arquivoNome, acao: 'importacao', campo: 'Resultado',
        valorNovo: r.lidas + ' linhas lidas · ' + r.novas + ' novas · ' + r.atualizadas + ' atualizadas · ' + r.inalteradas + ' sem alteração · ' +
          r.semTsi + ' sem ordem de TSI · ' + r.duplicadas + ' duplicadas', dataHora: agora }));

      ops.push({ colecao: 'importacoes', tipo: 'inserir', valor: importacao });
      ops.push({ colecao: 'importacoesLinhas', tipo: 'inserir', valor: linhas });
      return repo().lote(ops.concat(H().operacoes(evs))).then(function () {
        TSI.eventos.emitir('ordens:alterado');
        return importacao;
      });
    });
  }

  TSI.importacao = {
    ler: ler,
    analisar: analisar,
    confirmar: confirmar,
    ROTULO_SITUACAO: {
      nova: 'Nova', atualizada: 'Atualizada', inalterada: 'Sem alteração', sem_tsi: 'Sem ordem de TSI', duplicada: 'Duplicada na planilha'
    },
    listar: function () {
      return repo().importacoes.listar().then(function (l) {
        return l.sort(function (a, b) { return a.dataHora < b.dataHora ? 1 : -1; });
      });
    },
    linhasDa: function (importacaoId) { return repo().importacoesLinhas.obter(importacaoId); }
  };
})(window);
