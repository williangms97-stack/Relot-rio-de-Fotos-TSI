/* ==========================================================================
   Entrega de arquivos gerados (PDF) ao usuário: salvar e compartilhar
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var Erro = function (m) { return TSI.auth.Erro(m); };

  function baixarPorLink(blob, nome) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nome; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return 'salvo';
  }

  /* Quando a página roda dentro do visualizador do Claude, o download passa pela
     confirmação do próprio visualizador; em hospedagem comum, é um download normal. */
  function visualizador() {
    return global.claude && typeof global.claude.use === 'function' ? global.claude : null;
  }

  TSI.arquivos = {
    /** Salva o arquivo. Devolve 'salvo' ou 'recusado' (quando o usuário cancela a confirmação). */
    salvar: function (blob, nome) {
      var v = visualizador();
      if (!v) return Promise.resolve(baixarPorLink(blob, nome));
      return v.use('downloads').then(function (dl) {
        if (!dl) return baixarPorLink(blob, nome);
        return dl.save({ filename: nome, data: blob }).then(function () { return 'salvo'; }, function (e) {
          if (e && e.code === 'declined') return 'recusado';
          if (e && e.code === 'rate_limited') throw Erro('Já existe uma confirmação de download aberta. Conclua-a e tente de novo.');
          throw Erro('Não foi possível salvar o arquivo nesta visualização.');
        });
      });
    },

    /** true quando o aparelho permite compartilhar arquivos (WhatsApp, e-mail…) pelo menu do sistema. */
    podeCompartilhar: function () {
      if (visualizador() || !global.navigator.share || !global.navigator.canShare || typeof File !== 'function') return false;
      try { return global.navigator.canShare({ files: [new File([new Blob(['x'], { type: 'application/pdf' })], 'teste.pdf', { type: 'application/pdf' })] }); }
      catch (e) { return false; }
    },

    compartilhar: function (blob, nome, titulo) {
      var arquivo = new File([blob], nome, { type: blob.type || 'application/pdf' });
      return global.navigator.share({ files: [arquivo], title: titulo }).then(function () { return 'compartilhado'; }, function (e) {
        if (e && e.name === 'AbortError') return 'cancelado';
        throw Erro('Não foi possível abrir o compartilhamento neste aparelho.');
      });
    }
  };
})(window);
