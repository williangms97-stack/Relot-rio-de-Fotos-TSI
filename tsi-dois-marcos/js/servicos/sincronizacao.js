/* ==========================================================================
   Fila de sincronização
   --------------------------------------------------------------------------
   Nesta versão NÃO existe servidor central: os registros ficam guardados no
   aparelho e permanecem "Aguardando envio". Nada é marcado como sincronizado
   sem um envio real.

   Quando houver banco central, registre um adaptador:

     TSI.sincronizacao.registrarAdaptador({
       enviarRegistro: function (registro, fotos, item) { return fetch(...); }  // Promise
     });

   A partir daí a fila é processada sozinha ao salvar um registro e quando a
   conexão volta, marcando cada item como "Sincronizado" ou "Falha no envio".
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var util = TSI.util, cfg = TSI.config;
  // a fila é sempre do aparelho: com servidor central, TSI.repo.local é o banco local
  var repo = function () { return TSI.repo.local || TSI.repo; };
  var ENVIO = cfg.SITUACAO_ENVIO;
  var adaptador = null;
  var emAndamento = null;

  function ordenar(l) { return l.sort(function (a, b) { return a.criadoEm < b.criadoEm ? -1 : 1; }); }

  var sinc = TSI.sincronizacao = {
    registrarAdaptador: function (a) { adaptador = a || null; },
    configurada: function () { return !!adaptador; },
    online: function () { return global.navigator.onLine !== false; },

    novoItem: function (registro, operacao) {
      return {
        id: util.uuid(), registroId: registro.id, ordemTsi: registro.ordemTsi, rotulo: TSI.ordens.rotulo(registro), protocolo: registro.protocolo,
        operacao: operacao, situacao: ENVIO.AGUARDANDO, criadoEm: util.agora(),
        tentativas: 0, ultimaTentativa: null, erro: null
      };
    },

    fila: function () { return repo().filaSincronizacao.listar().then(ordenar); },

    resumo: function () {
      return repo().registros.listar().then(function (regs) {
        var r = { aguardando: 0, sincronizado: 0, falha: 0, total: regs.length };
        regs.forEach(function (x) { r[x.situacaoEnvio] = (r[x.situacaoEnvio] || 0) + 1; });
        return r;
      });
    },

    /** Envia os itens pendentes, um a um. Sem adaptador registrado, não faz nada. */
    processar: function () {
      if (!adaptador) return Promise.resolve({ configurada: false });
      if (!sinc.online()) return Promise.resolve({ configurada: true, online: false });
      if (emAndamento) return emAndamento;
      emAndamento = sinc.fila().then(function (itens) {
        var pendentes = itens.filter(function (i) { return i.situacao !== ENVIO.SINCRONIZADO; });
        var enviados = 0, falhas = 0;
        return pendentes.reduce(function (cadeia, item) {
          return cadeia.then(function () {
            return Promise.all([repo().registros.obter(item.registroId), TSI.registros.fotosDe(item.registroId)]).then(function (r) {
              var reg = r[0];
              if (!reg) return null;
              // registro feito por outro usuário neste aparelho: espera ele entrar de novo
              if (adaptador.podeEnviar && !adaptador.podeEnviar(item, reg)) return null;
              return Promise.resolve().then(function () { return adaptador.enviarRegistro(reg, r[1], item); }).then(function () {
                item.situacao = ENVIO.SINCRONIZADO; item.erro = null; enviados++;
                reg.erroEnvio = null;
              }, function (e) {
                item.situacao = ENVIO.FALHA; item.erro = (e && e.message) || 'Falha no envio'; falhas++;
                reg.erroEnvio = item.erro;
              }).then(function () {
                item.tentativas++; item.ultimaTentativa = util.agora();
                return repo().filaSincronizacao.porIndice('registroId', reg.id).then(function (doRegistro) {
                  var todos = doRegistro.map(function (i) { return i.id === item.id ? item : i; });
                  reg.situacaoEnvio = todos.some(function (i) { return i.situacao === ENVIO.FALHA; }) ? ENVIO.FALHA
                    : todos.every(function (i) { return i.situacao === ENVIO.SINCRONIZADO; }) ? ENVIO.SINCRONIZADO : ENVIO.AGUARDANDO;
                  return repo().lote([
                    { colecao: 'filaSincronizacao', tipo: 'salvar', valor: item },
                    { colecao: 'registros', tipo: 'salvar', valor: reg }
                  ]);
                });
              });
            });
          });
        }, Promise.resolve()).then(function () {
          if (enviados || falhas) TSI.eventos.emitir('registros:alterado');
          return { configurada: true, online: true, enviados: enviados, falhas: falhas };
        });
      }).then(function (r) { emAndamento = null; return r; }, function (e) { emAndamento = null; throw e; });
      return emAndamento;
    },

    iniciar: function () {
      global.addEventListener('online', function () {
        TSI.eventos.emitir('conexao:alterada', { online: true });
        sinc.processar().catch(function (e) { console.error('[sincronização]', e); });
      });
      global.addEventListener('offline', function () { TSI.eventos.emitir('conexao:alterada', { online: false }); });
    }
  };
})(window);
