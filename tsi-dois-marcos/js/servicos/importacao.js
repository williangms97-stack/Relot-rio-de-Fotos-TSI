/* ==========================================================================
   Importação da planilha RQ70 (Solicitação de Reembalagem e Tratamento)
   --------------------------------------------------------------------------
   1. ler(arquivo)          lê .xlsx/.xls com SheetJS e identifica as colunas pelo cabeçalho
   2. analisar(leituras)    compara um ou vários arquivos com a base: lotes novos, atualizados,
                            sem alteração e duplicados; reconhece a cultura pelo conteúdo
   3. confirmar(leituras)   grava lotes, importações, linhas lidas e histórico de uma só vez

   Cada linha é um lote (ver js/servicos/ordens.js). A importação só acrescenta e atualiza:
   o que não vier nos arquivos continua como está.

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
      if (escolhida.aba !== IMP.ABA_PREFERIDA && abas.indexOf(IMP.ABA_PREFERIDA) < 0) avisos.push('A aba "' + IMP.ABA_PREFERIDA + '" não foi encontrada; os dados foram lidos da aba "' + escolhida.aba + '".');
      var porPosicao = mapeamento.filter(function (m) { return m.origem === 'posicao'; });
      if (porPosicao.length) avisos.push('Colunas sem cabeçalho reconhecido, lidas pela posição padrão do RQ70: ' +
        porPosicao.map(function (m) { return m.rotulo + ' (' + m.coluna + ')'; }).join(', ') + '.');
      var ausentes = mapeamento.filter(function (m) { return m.origem === 'ausente'; });
      if (ausentes.length) avisos.push('Colunas não encontradas (ficarão vazias): ' + ausentes.map(function (m) { return m.rotulo; }).join(', ') + '.');
      if (celulasComErro) avisos.push(util.plural(celulasComErro, 'célula com erro do Excel (#REF!, #N/A…) foi importada vazia', 'células com erro do Excel (#REF!, #N/A…) foram importadas vazias') + '.');

      return {
        arquivoNome: nome, arquivoTamanho: arquivo.size, arquivoModificado: arquivo.lastModified || 0, aba: escolhida.aba,
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

  /* ------------------------------------------------------------------------
     Cultura pelo conteúdo da linha
     O RQ70 não tem coluna de cultura e o nome do arquivo não segue padrão, então a
     cultura é reconhecida pela cultivar, pela peneira, pela embalagem e pelo tratamento.
     Cada sinal soma pontos; vence a cultura com mais pontos (empate = não identificada).
     Depois, vale o que o sistema já aprendeu (cultivar já importada com cultura) e,
     por fim, a cultura única das demais linhas do mesmo arquivo.
     ------------------------------------------------------------------------ */
  var CULTURAS = ['Soja', 'Milho', 'Trigo', 'Sorgo'];
  var SINAIS = [
    // tecnologia da cultivar
    { cultura: 'Soja', campo: 'cultivar', pontos: 3, re: /I2X|IPRO|\bCE\b|\bE3\b|XTD|\bRR2?\b|ENLIST|CONKESTA/i },
    { cultura: 'Milho', campo: 'cultivar', pontos: 3, re: /VIP\s*3|PRO\s*[234]\b|\bVT\s*PRO|VYHR|\bPWU?\b|\bYHR\b|XDDFZ|RSCVZ|\bTRE\b/i },
    { cultura: 'Trigo', campo: 'cultivar', pontos: 3, re: /^BRS\b|^BRS\s*\d|^ORS|^TBIO|^FPS\b/i },
    // peneira: soja "P1 5,5"; milho "C3C", "R2L"; trigo "P1 P0"
    { cultura: 'Soja', campo: 'peneira', pontos: 2, re: /^P\s*[12]\s*\d+[.,]?\d*\s*$/i },
    { cultura: 'Soja', campo: 'peneira', pontos: 1, re: /^P\s*[12]\s*$/i },
    { cultura: 'Milho', campo: 'peneira', pontos: 3, re: /^[CR]\s*\d\s*[CLMG]?\s*$/i },
    { cultura: 'Trigo', campo: 'peneira', pontos: 3, re: /\bP\s*0\b/i },
    // embalagem e tratamento (sinais fracos)
    { cultura: 'Soja', campo: 'tipoEmbalagem', pontos: 1, re: /\b5\s*MI\b|I2X|IPRO/i },
    { cultura: 'Soja', campo: 'embalagemOriginal', pontos: 1, re: /\b5\s*MI\b/i },
    { cultura: 'Milho', campo: 'embalagemOriginal', pontos: 1, re: /\b60\s*M\b/i },
    { cultura: 'Milho', campo: 'tratamento', pontos: 1, re: /PONCHO|ACRONIS/i }
  ];

  function pontuarCultura(v) {
    var pontos = {};
    SINAIS.forEach(function (s) {
      var t = v[s.campo];
      if (t !== null && t !== undefined && s.re.test(String(t))) pontos[s.cultura] = (pontos[s.cultura] || 0) + s.pontos;
    });
    var melhor = null, max = 0, empate = false;
    Object.keys(pontos).forEach(function (c) {
      if (pontos[c] > max) { melhor = c; max = pontos[c]; empate = false; } else if (pontos[c] === max) empate = true;
    });
    return empate ? null : melhor;
  }

  /** cultivar -> cultura, a partir do que já está na base (só quando não há dúvida). */
  function aprenderCulturas(ordens) {
    var visto = {};
    ordens.forEach(function (o) {
      var k = util.chave(o.cultivar);
      if (!k || !o.cultura) return;
      if (visto[k] === undefined) visto[k] = o.cultura;
      else if (visto[k] !== o.cultura) visto[k] = null;
    });
    return visto;
  }

  function montarOrdem(valores) {
    var o = {};
    O().CAMPOS.forEach(function (def) { o[def.campo] = valores[def.campo] === undefined ? null : valores[def.campo]; });
    o.ordemTsi = O().ordemValida(o.ordemTsi) || null;
    o.dataTexto = valores.dataTexto || null;
    o.classeEmbalagem = O().classificarEmbalagem(o.tipoEmbalagem);
    return o;
  }

  function diferencas(atual, nova) {
    var d = [];
    O().CAMPOS.forEach(function (def) {
      var de = atual[def.campo], para = nova[def.campo];
      if (def.campo === 'ordemTsi' && !para) return;           // a importação nunca apaga o número da ordem
      if (def.campo === 'data' && iguais(de, para) && !iguais(atual.dataTexto, nova.dataTexto)) { de = atual.dataTexto; para = nova.dataTexto; }
      if (!iguais(de, para)) d.push({ campo: def.campo, rotulo: def.rotulo, de: O().fmtCampo(atual, def.campo), para: O().fmtCampo(nova, def.campo) });
    });
    if (nova.cultura && !iguais(atual.cultura, nova.cultura)) {
      d.push({ campo: 'cultura', rotulo: 'Cultura', de: atual.cultura || '—', para: nova.cultura });
    }
    return d;
  }

  /** Arquivos em ordem do mais antigo para o mais novo: em linhas repetidas, vale o arquivo mais novo. */
  function ordenarLeituras(leituras) {
    return leituras.map(function (l, i) { return { l: l, i: i }; }).sort(function (a, b) {
      return ((a.l.arquivoModificado || 0) - (b.l.arquivoModificado || 0)) || (a.i - b.i);
    }).map(function (x) { return x.l; });
  }

  /** Classifica cada linha lida (de um ou vários arquivos) em relação à base atual. Não grava nada.
      escolhas = { "<arquivo>:<linha>": cultura } — culturas definidas à mão na pré-visualização. */
  function analisar(leituras, escolhas) {
    leituras = ordenarLeituras([].concat(leituras || []));
    escolhas = escolhas || {};
    return O().visao().then(function (visao) {
      var porChave = {}, porOrdemLote = {}, porOrdem = {}, semOrdemPorLote = {};
      visao.forEach(function (i) {
        var o = i.ordem, lote = O().normalizarLote(o.lote);
        porChave[i.chave] = i;
        if (o.ordemTsi) {
          porOrdemLote[o.ordemTsi + '|' + lote] = i;
          (porOrdem[o.ordemTsi] = porOrdem[o.ordemTsi] || []).push(i);
        } else if (lote) (semOrdemPorLote[lote] = semOrdemPorLote[lote] || []).push(i);
      });
      var aprendidas = aprenderCulturas(visao.map(function (i) { return i.ordem; }));

      // quantas linhas de cada ordem vieram nos arquivos (para reconhecer troca de lote)
      var linhasDaOrdem = {};
      leituras.forEach(function (l) {
        l.linhas.forEach(function (x) { var n = O().ordemValida(x.valores.ordemTsi); if (n) linhasDaOrdem[n] = (linhasDaOrdem[n] || 0) + 1; });
      });

      var itens = [], ocupadas = {}, vinculadas = {};
      var arquivos = leituras.map(function (l, ia) {
        var resumo = { lidas: l.linhas.length, novas: 0, atualizadas: 0, inalteradas: 0, semIdentificacao: 0, duplicadas: 0, semOrdem: 0, vinculadas: 0 };
        var repeticoes = {}, semOrdemChave = '';
        var doArquivo = l.linhas.map(function (x) {
          var v = x.valores, it = { id: ia + ':' + x.linha, arquivo: ia, linha: x.linha, valores: v, erros: x.erros, diferencas: [], avisos: [], situacao: '' };
          var nova = montarOrdem(v), lote = O().normalizarLote(nova.lote), ordem = nova.ordemTsi;
          it.ordemTsi = ordem;
          if (!ordem && !lote) { it.situacao = 'sem_identificacao'; return it; }
          if (!ordem) resumo.semOrdem++;

          // cultura pelo conteúdo
          nova.cultura = pontuarCultura(nova);
          it.origemCultura = nova.cultura ? 'conteudo' : null;
          if (!nova.cultura && aprendidas[util.chave(nova.cultivar)]) { nova.cultura = aprendidas[util.chave(nova.cultivar)]; it.origemCultura = 'aprendida'; }

          // a que lote da base esta linha corresponde
          var atual = null;
          if (ordem) {
            atual = porOrdemLote[ordem + '|' + lote] || null;
            if (!atual && semOrdemPorLote[lote]) {
              // lote que estava sem ordem: a ordem foi informada agora
              var livres = semOrdemPorLote[lote].filter(function (c) { return !vinculadas[c.chave]; });
              var mesmaData = livres.filter(function (c) { return nova.data && c.ordem.data === nova.data; });
              var alvo = mesmaData.length === 1 ? mesmaData[0] : livres.length === 1 ? livres[0] : null;
              if (alvo) { atual = alvo; vinculadas[alvo.chave] = true; it.vinculo = true; }
              else if (livres.length > 1) it.avisos.push('Há ' + livres.length + ' solicitações deste lote sem ordem; esta linha entra como lote novo. Confira em Ordens.');
            }
            if (!atual && porOrdem[ordem] && porOrdem[ordem].length === 1 && linhasDaOrdem[ordem] === 1) {
              atual = porOrdem[ordem][0];   // mesma ordem com o lote corrigido na planilha
            }
          } else {
            // mesmo lote sem ordem mais de uma vez na mesma data: cada linha é uma solicitação
            var base = O().montarChave(nova);
            repeticoes[base] = (repeticoes[base] || 0) + 1;
            semOrdemChave = repeticoes[base] > 1 ? base + '#' + repeticoes[base] : base;
            atual = porChave[semOrdemChave] || null;
          }
          it.chave = atual ? atual.chave : ordem ? O().montarChave(nova) : semOrdemChave;
          nova.chave = it.chave;
          if (atual && !ordem && atual.ordem.ordemTsi) nova.ordemTsi = atual.ordem.ordemTsi;   // não apaga ordem já informada
          it.ordem = nova;
          it.atual = atual ? atual.ordem : null;
          it.registro = atual ? atual.registro : null;
          it.situacaoOrdem = atual ? atual.situacao : null;

          // mesma linha em outro arquivo ou repetida no mesmo arquivo
          var antes = ocupadas[it.chave];
          if (antes) {
            if (antes.arquivo === ia) { it.situacao = 'duplicada'; it.primeiraLinha = antes.linha; return it; }
            antes.situacao = 'substituida'; antes.substituidaPor = l.arquivoNome;
          }
          ocupadas[it.chave] = it;
          return it;
        });
        itens = itens.concat(doArquivo);
        return { indice: ia, nome: l.arquivoNome, tamanho: l.arquivoTamanho, aba: l.aba, linhaCabecalho: l.linhaCabecalho,
          mapeamento: l.mapeamento, avisos: l.avisos, resumo: resumo };
      });

      // cultura única do arquivo para as linhas não reconhecidas; depois, as escolhidas à mão
      arquivos.forEach(function (a) {
        var doArq = itens.filter(function (it) { return it.arquivo === a.indice && it.ordem; });
        var culturas = util.unicos(doArq.map(function (it) { return it.ordem.cultura; }).filter(Boolean));
        a.culturaUnica = culturas.length === 1 ? culturas[0] : null;
        doArq.forEach(function (it) {
          if (!it.ordem.cultura && a.culturaUnica) { it.ordem.cultura = a.culturaUnica; it.origemCultura = 'arquivo'; }
          if (escolhas[it.id]) { it.ordem.cultura = escolhas[it.id]; it.origemCultura = 'manual'; }
          if (!it.ordem.cultura && it.atual && it.atual.cultura) { it.ordem.cultura = it.atual.cultura; it.origemCultura = 'base'; }
        });
      });

      // situação final de cada linha
      var total = { lidas: 0, novas: 0, atualizadas: 0, inalteradas: 0, semIdentificacao: 0, duplicadas: 0, substituidas: 0,
        semOrdem: 0, vinculadas: 0, semCultura: 0, fotografadas: 0, mudancaCultura: 0 };
      var culturasResumo = {};
      itens.forEach(function (it) {
        var a = arquivos[it.arquivo].resumo;
        total.lidas++;
        if (it.situacao === 'sem_identificacao') { a.semIdentificacao++; total.semIdentificacao++; return; }
        if (it.situacao === 'duplicada') { a.duplicadas++; total.duplicadas++; return; }
        if (it.situacao === 'substituida') { total.substituidas++; return; }
        if (!it.ordem.ordemTsi) total.semOrdem++;
        if (!it.ordem.cultura) total.semCultura++;
        var c = it.ordem.cultura || 'Não identificada';
        culturasResumo[c] = (culturasResumo[c] || 0) + 1;
        if (!it.atual) { it.situacao = 'nova'; a.novas++; total.novas++; return; }
        it.diferencas = diferencas(it.atual, it.ordem);
        if (!it.diferencas.length) { it.situacao = 'inalterada'; a.inalteradas++; total.inalteradas++; return; }
        it.situacao = 'atualizada'; a.atualizadas++; total.atualizadas++;
        if (it.vinculo) { a.vinculadas++; total.vinculadas++; }
        if (it.atual.cultura && it.ordem.cultura && it.atual.cultura !== it.ordem.cultura) {
          total.mudancaCultura++;
          it.avisos.push('A cultura deste lote vai mudar de ' + it.atual.cultura + ' para ' + it.ordem.cultura + '.');
        }
        if (it.registro) {
          total.fotografadas++;
          it.avisos.push('Este lote já foi fotografado. A alteração não muda o registro feito.');
        }
      });
      arquivos.forEach(function (a) {
        var c = {};
        itens.forEach(function (it) {
          if (it.arquivo !== a.indice || !it.ordem || ['duplicada', 'substituida', 'sem_identificacao'].indexOf(it.situacao) >= 0) return;
          var k = it.ordem.cultura || 'Não identificada';
          c[k] = (c[k] || 0) + 1;
        });
        a.culturas = c;
      });
      return { arquivos: arquivos, itens: itens, resumo: total, culturas: culturasResumo, escolhas: escolhas };
    });
  }

  function textoCulturas(c) {
    return Object.keys(c || {}).sort().map(function (k) { return k + ' (' + util.fmtNum(c[k], 0) + ')'; }).join(', ');
  }

  /** Grava a importação (uma por arquivo). Lotes existentes são atualizados sem tocar nos registros fotográficos;
      o que não veio nos arquivos continua como está. */
  function confirmar(leituras, escolhas) {
    var adm = TSI.auth.exigirAdm();
    leituras = ordenarLeituras([].concat(leituras || []));
    return analisar(leituras, escolhas).then(function (an) {
      var agora = util.agora(), grupo = util.uuid(), ops = [], evs = [];
      var ids = an.arquivos.map(function () { return util.uuid(); });
      an.itens.forEach(function (it) {
        var id = ids[it.arquivo], nomeArq = an.arquivos[it.arquivo].nome;
        if (it.situacao === 'nova') {
          var nova = it.ordem;
          nova.criadoEm = agora; nova.atualizadoEm = agora; nova.importacaoId = id; nova.ultimaImportacaoId = id; nova.linhaPlanilha = it.linha;
          ops.push({ colecao: 'ordens', tipo: 'salvar', valor: nova });
        } else if (it.situacao === 'atualizada') {
          var o = Object.assign({}, it.atual), dados = it.ordem;
          O().CAMPOS.forEach(function (def) { if (def.campo !== 'ordemTsi' || dados.ordemTsi) o[def.campo] = dados[def.campo]; });
          o.chave = it.chave;
          o.dataTexto = dados.dataTexto;
          o.classeEmbalagem = dados.classeEmbalagem;
          if (dados.cultura) o.cultura = dados.cultura;
          o.atualizadoEm = agora; o.ultimaImportacaoId = id; o.linhaPlanilha = it.linha;
          ops.push({ colecao: 'ordens', tipo: 'salvar', valor: o });
          it.diferencas.forEach(function (d) {
            evs.push(H().evento({ entidade: 'ordem', entidadeId: it.chave, rotulo: O().rotulo(o), acao: 'atualizacao',
              campo: d.rotulo, valorAnterior: d.de === '—' ? null : d.de, valorNovo: d.para === '—' ? null : d.para,
              motivo: (d.campo === 'ordemTsi' ? 'Ordem informada na planilha ' : 'Planilha ') + nomeArq, dataHora: agora }));
          });
        }
      });

      var campos = O().CAMPOS.map(function (c) { return c.campo; });
      an.arquivos.forEach(function (a) {
        var id = ids[a.indice], r = a.resumo;
        ops.push({ colecao: 'importacoes', tipo: 'inserir', valor: {
          id: id, grupoId: grupo, dataHora: agora, usuarioId: adm.id, usuarioNome: adm.nome,
          arquivoNome: a.nome, arquivoTamanho: a.tamanho, aba: a.aba, linhaCabecalho: a.linhaCabecalho,
          cultura: textoCulturas(a.culturas) || null, culturas: a.culturas,
          resumo: { lidas: r.lidas, novas: r.novas, atualizadas: r.atualizadas, inalteradas: r.inalteradas,
            semTsi: r.semOrdem, semIdentificacao: r.semIdentificacao, duplicadas: r.duplicadas, vinculadas: r.vinculadas },
          mapeamento: a.mapeamento, avisos: a.avisos } });
        ops.push({ colecao: 'importacoesLinhas', tipo: 'inserir', valor: {
          importacaoId: id, campos: campos,
          linhas: an.itens.filter(function (it) { return it.arquivo === a.indice; }).map(function (it) {
            return { linha: it.linha, situacao: it.situacao, cultura: it.ordem ? it.ordem.cultura || null : null, dataTexto: it.valores.dataTexto || null,
              erros: it.erros.length ? it.erros : undefined,
              v: campos.map(function (c) { return it.valores[c] === undefined ? null : it.valores[c]; }) };
          }) } });
        evs.push(H().evento({ entidade: 'importacao', entidadeId: id, rotulo: 'Planilha ' + a.nome, acao: 'importacao', campo: 'Resultado',
          valorNovo: r.lidas + ' linhas lidas · ' + r.novas + ' novas · ' + r.atualizadas + ' atualizadas · ' + r.inalteradas + ' sem alteração · ' +
            r.semOrdem + ' sem ordem de TSI · ' + r.duplicadas + ' duplicadas' + (textoCulturas(a.culturas) ? ' · ' + textoCulturas(a.culturas) : ''),
          dataHora: agora }));
      });

      return repo().lote(ops.concat(H().operacoes(evs))).then(function () {
        TSI.eventos.emitir('ordens:alterado');
        return { resumo: an.resumo, arquivos: an.arquivos.length };
      });
    });
  }

  TSI.importacao = {
    ler: ler,
    analisar: analisar,
    confirmar: confirmar,
    CULTURAS: CULTURAS,
    detectarCultura: pontuarCultura,
    textoCulturas: textoCulturas,
    ROTULO_SITUACAO: {
      nova: 'Nova', atualizada: 'Atualizada', inalterada: 'Sem alteração', sem_identificacao: 'Sem ordem e sem lote',
      sem_tsi: 'Sem ordem de TSI', duplicada: 'Duplicada na planilha', substituida: 'Repetida em arquivo mais novo'
    },
    listar: function () {
      return repo().importacoes.listar().then(function (l) {
        return l.sort(function (a, b) { return a.dataHora < b.dataHora ? 1 : -1; });
      });
    },
    linhasDa: function (importacaoId) { return repo().importacoesLinhas.obter(importacaoId); }
  };
})(window);
