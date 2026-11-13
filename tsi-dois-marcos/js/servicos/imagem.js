/* ==========================================================================
   Fotografia da amostra — preparo e verificação básica
   --------------------------------------------------------------------------
   O que é conferido aqui (cálculo local, no próprio aparelho):
     - arquivo válido (é imagem e abre sem erro)
     - imagem não vazia (tem conteúdo, não é uma cor única)
     - resolução mínima
     - iluminação (média de luminância) e nitidez (variância do Laplaciano em relação
       ao contraste da imagem, para não confundir foto escura com foto desfocada)
   Iluminação e nitidez são medidas simples de pixels: geram AVISOS, não bloqueiam.
   Não há inteligência artificial nesta versão. Para ligar um serviço de visão
   computacional no futuro, use TSI.imagem.registrarAnalisador(fn).
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var util = TSI.util, F = TSI.config.FOTO;
  var analisadorExterno = null;

  function decodificar(arquivo) {
    function porElemento() {
      return new Promise(function (ok, falha) {
        var url = URL.createObjectURL(arquivo), img = new Image();
        img.onload = function () {
          ok({ fonte: img, largura: img.naturalWidth, altura: img.naturalHeight, liberar: function () { URL.revokeObjectURL(url); } });
        };
        img.onerror = function () { URL.revokeObjectURL(url); falha(new Error('decodificação')); };
        img.src = url;
      });
    }
    if (typeof global.createImageBitmap !== 'function') return porElemento();
    return global.createImageBitmap(arquivo, { imageOrientation: 'from-image' }).then(function (bmp) {
      return { fonte: bmp, largura: bmp.width, altura: bmp.height, liberar: function () { if (bmp.close) bmp.close(); } };
    }, porElemento);
  }

  function desenhar(fonte, largura, altura) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(largura));
    c.height = Math.max(1, Math.round(altura));
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fonte, 0, 0, c.width, c.height);
    return c;
  }

  function escala(l, a, ladoMax) { return Math.min(1, ladoMax / Math.max(l, a)); }

  function paraBlob(canvas, qualidade) {
    return new Promise(function (ok, falha) {
      if (!canvas.toBlob) { falha(new Error('toBlob indisponível')); return; }
      canvas.toBlob(function (b) { b ? ok(b) : falha(new Error('Falha ao gerar a imagem.')); }, 'image/jpeg', qualidade);
    });
  }

  function paraBuffer(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (ok, falha) {
      var fr = new FileReader();
      fr.onload = function () { ok(fr.result); };
      fr.onerror = function () { falha(fr.error); };
      fr.readAsArrayBuffer(blob);
    });
  }

  /** Média e desvio da luminância e variância do Laplaciano (medida clássica de foco). */
  function medir(canvas) {
    var w = canvas.width, h = canvas.height;
    var px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    var n = w * h, g = new Float32Array(n), soma = 0, soma2 = 0, i;
    for (i = 0; i < n; i++) {
      var v = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      g[i] = v; soma += v; soma2 += v * v;
    }
    var media = soma / n, desvio = Math.sqrt(Math.max(0, soma2 / n - media * media));
    var sl = 0, sl2 = 0, k = 0;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        i = y * w + x;
        var lap = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
        sl += lap; sl2 += lap * lap; k++;
      }
    }
    var laplaciano = k ? sl2 / k - (sl / k) * (sl / k) : 0;
    // índice relativo: não muda com o brilho; cai rápido quando a imagem perde detalhe fino
    return { media: media, desvio: desvio, nitidez: laplaciano / Math.max(desvio * desvio, 1) };
  }

  /**
   * Confere e prepara a fotografia.
   * Devolve { ok, erros[], avisos[], verificacao{}, foto{} } — "foto" só existe quando ok = true.
   */
  function processar(arquivo) {
    var r = { ok: false, erros: [], avisos: [], foto: null, verificacao: {
      metodo: 'verificacao-basica-local', arquivoValido: false, naoVazia: null, largura: null, altura: null, resolucaoOk: null,
      luminancia: null, iluminacao: 'nao_avaliada', indiceNitidez: null, nitidez: 'nao_avaliada', analiseExterna: null } };
    var v = r.verificacao;

    if (!arquivo || !arquivo.size) { r.erros.push('O arquivo está vazio. Fotografe novamente.'); return Promise.resolve(r); }
    if (arquivo.type && arquivo.type.indexOf('image/') !== 0) { r.erros.push('O arquivo selecionado não é uma imagem.'); return Promise.resolve(r); }

    return decodificar(arquivo).then(function (img) {
      v.arquivoValido = true;
      v.largura = img.largura; v.altura = img.altura;
      var maior = Math.max(img.largura, img.altura), menor = Math.min(img.largura, img.altura);
      v.resolucaoOk = maior >= F.MIN_LADO_MAIOR && menor >= F.MIN_LADO_MENOR;
      if (!v.resolucaoOk) {
        r.erros.push('Resolução insuficiente (' + img.largura + '×' + img.altura + ' px). O mínimo é ' + F.MIN_LADO_MAIOR + '×' + F.MIN_LADO_MENOR + ' px.');
      }

      try {
        var ea = escala(img.largura, img.altura, 1024);
        var m = medir(desenhar(img.fonte, img.largura * ea, img.altura * ea));
        v.luminancia = Math.round(m.media);
        v.indiceNitidez = Math.round(m.nitidez * 1000) / 1000;
        v.naoVazia = m.desvio >= F.DESVIO_MIN;
        if (!v.naoVazia) {
          r.erros.push('A imagem está vazia: não há conteúdo visível (cor única). Fotografe a amostra novamente.');
        } else {
          v.iluminacao = m.media < F.LUMINANCIA_MIN ? 'escura' : m.media > F.LUMINANCIA_MAX ? 'clara' : 'ok';
          v.nitidez = m.nitidez < F.NITIDEZ_MIN ? 'baixa' : 'ok';
          if (v.iluminacao === 'escura') r.avisos.push('A foto parece escura. Se possível, refaça em local mais iluminado.');
          if (v.iluminacao === 'clara') r.avisos.push('A foto parece clara demais (luz estourada). Se possível, refaça sem reflexo.');
          if (v.nitidez === 'baixa') r.avisos.push('A foto pode estar desfocada. Confira a nitidez antes de continuar.');
        }
      } catch (e) {
        v.naoVazia = true;   // não foi tecnicamente possível medir os pixels neste navegador
      }

      if (r.erros.length) { img.liberar(); return r; }

      var e = escala(img.largura, img.altura, F.LADO_MAXIMO);
      var final = desenhar(img.fonte, img.largura * e, img.altura * e);
      var em = escala(img.largura, img.altura, F.MINIATURA);
      var mini = desenhar(img.fonte, img.largura * em, img.altura * em);
      img.liberar();

      return paraBlob(final, F.QUALIDADE).then(paraBuffer).then(function (buffer) {
        r.foto = {
          dados: buffer, tipo: 'image/jpeg', largura: final.width, altura: final.height, tamanho: buffer.byteLength,
          miniatura: mini.toDataURL('image/jpeg', 0.72), capturadaEm: util.agora(), verificacao: v,
          larguraOriginal: v.largura, alturaOriginal: v.altura
        };
        r.ok = true;
        if (!analisadorExterno) return r;
        return Promise.resolve().then(function () { return analisadorExterno(new Blob([buffer], { type: 'image/jpeg' }), v); })
          .then(function (resp) { v.analiseExterna = resp || null; return r; }, function () { return r; });
      });
    }, function () {
      r.erros.push('Não foi possível abrir a imagem. O arquivo pode estar corrompido ou em formato não suportado (use JPG ou PNG).');
      return r;
    });
  }

  TSI.imagem = {
    processar: processar,
    /** Ponto de extensão para análise por visão computacional (não utilizado nesta versão). */
    registrarAnalisador: function (fn) { analisadorExterno = typeof fn === 'function' ? fn : null; }
  };
})(window);
