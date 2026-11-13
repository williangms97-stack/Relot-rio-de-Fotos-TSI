/* ==========================================================================
   Registros fotográficos de TSI
   --------------------------------------------------------------------------
   Regras principais:
   - cada ordem de TSI aceita um único registro válido (índice único no banco);
   - o operador não edita nem exclui o que enviou;
   - o ADM corrige ou anula, sempre com motivo e histórico campo a campo;
   - nada é apagado: registro anulado continua guardado e visível ao ADM.
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var util = TSI.util, cfg = TSI.config, repo = function () { return TSI.repo; };
  var Erro = function (m) { return TSI.auth.Erro(m); };
  var H = function () { return TSI.historico; };
  var SIT = cfg.SITUACAO_ORDEM;

  function p2(n) { return (n < 10 ? '0' : '') + n; }

  function gerarProtocolo(numero, quando) {
    var d = new Date(quando);
    return 'TSI-' + numero + '-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' +
      p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + '-' + util.codigoCurto(3);
  }

  function validarQuantidade(v) {
    var n = util.paraNumero(v);
    if (n === null) throw Erro('Informe a quantidade efetivamente tratada.');
    if (n < 0) throw Erro('A quantidade não pode ser negativa.');
    if (n > 100000) throw Erro('Quantidade fora do limite aceito. Confira o valor digitado.');
    return Math.round(n * 100) / 100;
  }

  function haDivergencia(prevista, efetiva) {
    return prevista !== null && prevista !== undefined && Math.abs(efetiva - prevista) > 1e-9;
  }

  /** Confere a justificativa quando a quantidade tratada difere da prevista. */
  function validarJustificativa(divergente, motivo, descricao) {
    if (!divergente) return { motivo: null, descricao: null };
    var m = util.limpar(motivo), d = util.limpar(descricao);
    if (cfg.MOTIVOS_DIVERGENCIA.indexOf(m) < 0) throw Erro('Selecione o motivo da divergência de quantidade.');
    if (m === cfg.MOTIVO_EXIGE_DESCRICAO && d.length < 5) throw Erro('Descreva o motivo da divergência (mínimo de 5 caracteres).');
    return { motivo: m, descricao: d || null };
  }

  /** Cópia dos dados da ordem no momento do registro: o relatório não muda se a planilha mudar depois. */
  function instantaneo(o) {
    var c = {};
    ['data', 'dataTexto', 'armazem', 'localProducao', 'cultivar', 'lote', 'categoria', 'peneira', 'tratamento', 'tipoEmbalagem',
      'classeEmbalagem', 'qtdTsi', 'pesoEmbTsi', 'observacoes', 'cultura', 'ordemReembalagem'].forEach(function (k) {
      c[k] = o[k] === undefined ? null : o[k];
    });
    return c;
  }

  function ordenarRecentes(l) { return l.sort(function (a, b) { return a.criadoEm < b.criadoEm ? 1 : -1; }); }

  var registros = TSI.registros = {
    haDivergencia: haDivergencia,
    validarQuantidade: validarQuantidade,
    validarJustificativa: validarJustificativa,

    listar: function () { return repo().registros.listar().then(ordenarRecentes); },
    listarDoOperador: function (usuarioId) { return repo().registros.porIndice('operadorId', usuarioId).then(ordenarRecentes); },
    obter: function (id) { return repo().registros.obter(id); },
    fotosDe: function (registroId) {
      return repo().fotos.porIndice('registroId', registroId).then(function (l) {
        return l.sort(function (a, b) { return a.posicao - b.posicao; });
      });
    },

    /** Cria o registro com as fotografias, a entrada na fila de envio e o evento de auditoria — tudo de uma vez. */
    criar: function (d) {
      var usuario = TSI.auth.exigirLogin();
      var numero = TSI.ordens.normalizarNumero(d.ordemTsi);
      var fotos = d.fotos || [];
      if (!fotos.length) return Promise.reject(Erro('A fotografia da amostra é obrigatória.'));
      if (fotos.length > 1 + cfg.FOTO.MAX_COMPLEMENTARES) return Promise.reject(Erro('Limite de fotografias excedido.'));

      return Promise.all([TSI.ordens.consultar(numero), repo().maquinas.obter(d.maquinaId || '')]).then(function (r) {
        var c = r[0], maquina = r[1];
        if (!c.ordem) throw Erro('Ordem ' + numero + ' não localizada na base do RQ70.');
        if (c.situacao === SIT.REGISTRADA) throw Erro('A ordem ' + numero + ' já possui registro fotográfico.');
        if (c.situacao !== SIT.PENDENTE) throw Erro('A ordem ' + numero + ' está ' + cfg.ROTULO_SITUACAO_ORDEM[c.situacao].toLowerCase() + ' e não aceita registro.');
        if (!maquina || !maquina.ativa) throw Erro('Selecione uma máquina ativa.');

        var prevista = TSI.ordens.qtdPrevista(c.ordem);
        var efetiva = validarQuantidade(d.qtdEfetiva);
        var divergente = haDivergencia(prevista, efetiva);
        var just = validarJustificativa(divergente, d.motivoDivergencia, d.descricaoDivergencia);

        var agora = util.agora(), id = util.uuid();
        var docsFotos = fotos.map(function (f, i) {
          return {
            id: util.uuid(), registroId: id, principal: i === 0, posicao: i,
            dados: f.dados, tipo: f.tipo || 'image/jpeg', largura: f.largura, altura: f.altura, tamanho: f.tamanho,
            miniatura: f.miniatura, capturadaEm: f.capturadaEm || agora, verificacao: f.verificacao || null
          };
        });
        var registro = {
          id: id,
          protocolo: gerarProtocolo(numero, agora),
          ordemTsi: numero,
          chaveOrdemAtiva: numero,           // índice único: impede segundo registro válido da mesma ordem
          ordem: instantaneo(c.ordem),
          qtdPrevista: prevista,
          qtdEfetiva: efetiva,
          divergencia: divergente,
          motivoDivergencia: just.motivo,
          descricaoDivergencia: just.descricao,
          maquinaId: maquina.id,
          maquinaNome: maquina.nome,
          operadorId: usuario.id,
          operadorUsuario: usuario.usuario,
          operadorNome: usuario.nome,
          criadoEm: agora,
          fotoPrincipalId: docsFotos[0].id,
          totalFotos: docsFotos.length,
          miniatura: docsFotos[0].miniatura,
          situacaoEnvio: cfg.SITUACAO_ENVIO.AGUARDANDO,
          corrigidoEm: null, corrigidoPor: null,
          anulado: null
        };
        var ops = [{ colecao: 'registros', tipo: 'inserir', valor: registro }];
        docsFotos.forEach(function (f) { ops.push({ colecao: 'fotos', tipo: 'inserir', valor: f }); });
        ops.push({ colecao: 'filaSincronizacao', tipo: 'inserir', valor: TSI.sincronizacao.novoItem(registro, 'criar') });
        ops.push({ colecao: 'rascunhos', tipo: 'remover', chave: usuario.id });
        ops = ops.concat(H().operacoes([H().evento({ entidade: 'registro', entidadeId: id, rotulo: 'Registro da ordem ' + numero,
          acao: 'criacao', campo: 'Protocolo', valorNovo: registro.protocolo, dataHora: agora })]));

        return repo().lote(ops).then(function () {
          TSI.eventos.emitir('registros:alterado', { id: id });
          TSI.sincronizacao.processar().catch(function (e) { console.error('[sincronização]', e); });
          return registro;
        }, function (e) {
          if (repo().erroDeDuplicidade(e)) throw Erro('A ordem ' + numero + ' já possui registro fotográfico.');
          throw e;
        });
      });
    },

    /** Correção feita pelo ADM. Cada campo alterado gera um evento com valor anterior e novo. */
    editar: function (id, novo, motivoCorrecao) {
      var adm = TSI.auth.exigirAdm();
      var motivo = util.limpar(motivoCorrecao);
      if (motivo.length < 5) return Promise.reject(Erro('Informe o motivo da correção (mínimo de 5 caracteres).'));
      return Promise.all([repo().registros.obter(id), repo().maquinas.obter(novo.maquinaId || '')]).then(function (r) {
        var reg = r[0], maquina = r[1];
        if (!reg) throw Erro('Registro não encontrado.');
        if (reg.anulado) throw Erro('Registro anulado não pode ser editado.');
        if (!maquina) throw Erro('Selecione a máquina.');
        if (!maquina.ativa && maquina.id !== reg.maquinaId) throw Erro('A máquina selecionada está inativa.');

        var efetiva = validarQuantidade(novo.qtdEfetiva);
        var divergente = haDivergencia(reg.qtdPrevista, efetiva);
        var just = validarJustificativa(divergente, novo.motivoDivergencia, novo.descricaoDivergencia);
        var agora = util.agora(), rot = 'Registro da ordem ' + reg.ordemTsi, evs = [];
        function mudou(campo, antes, depois) {
          if ((antes === null || antes === undefined ? '' : antes) === (depois === null || depois === undefined ? '' : depois)) return;
          evs.push(H().evento({ entidade: 'registro', entidadeId: reg.id, rotulo: rot, acao: 'edicao', campo: campo,
            valorAnterior: antes, valorNovo: depois, motivo: motivo, dataHora: agora }));
        }
        mudou('Quantidade efetivamente tratada', reg.qtdEfetiva, efetiva);
        mudou('Máquina', reg.maquinaNome, maquina.nome);
        mudou('Motivo da divergência', reg.motivoDivergencia, just.motivo);
        mudou('Descrição da divergência', reg.descricaoDivergencia, just.descricao);
        if (!evs.length) throw Erro('Nenhuma informação foi alterada.');

        reg.qtdEfetiva = efetiva; reg.divergencia = divergente;
        reg.motivoDivergencia = just.motivo; reg.descricaoDivergencia = just.descricao;
        reg.maquinaId = maquina.id; reg.maquinaNome = maquina.nome;
        reg.corrigidoEm = agora; reg.corrigidoPor = adm.nome;
        reg.situacaoEnvio = cfg.SITUACAO_ENVIO.AGUARDANDO;
        var ops = [{ colecao: 'registros', tipo: 'salvar', valor: reg },
          { colecao: 'filaSincronizacao', tipo: 'inserir', valor: TSI.sincronizacao.novoItem(reg, 'atualizar') }].concat(H().operacoes(evs));
        return repo().lote(ops).then(function () {
          TSI.eventos.emitir('registros:alterado', { id: reg.id });
          TSI.sincronizacao.processar().catch(function (e) { console.error('[sincronização]', e); });
          return reg;
        });
      });
    },

    /** Anula o registro (ADM). A ordem volta a ficar pendente e pode receber novo registro. */
    anular: function (id, motivoAnulacao) {
      var adm = TSI.auth.exigirAdm();
      var motivo = util.limpar(motivoAnulacao);
      if (motivo.length < 5) return Promise.reject(Erro('Informe o motivo da anulação (mínimo de 5 caracteres).'));
      return repo().registros.obter(id).then(function (reg) {
        if (!reg) throw Erro('Registro não encontrado.');
        if (reg.anulado) throw Erro('Este registro já está anulado.');
        var agora = util.agora();
        reg.anulado = { em: agora, porId: adm.id, porNome: adm.nome, motivo: motivo };
        reg.chaveOrdemAtiva = 'anulado:' + reg.id;
        reg.situacaoEnvio = cfg.SITUACAO_ENVIO.AGUARDANDO;
        var ev = H().evento({ entidade: 'registro', entidadeId: reg.id, rotulo: 'Registro da ordem ' + reg.ordemTsi, acao: 'anulacao',
          campo: 'Situação do registro', valorAnterior: 'Válido', valorNovo: 'Anulado', motivo: motivo, dataHora: agora });
        var ops = [{ colecao: 'registros', tipo: 'salvar', valor: reg },
          { colecao: 'filaSincronizacao', tipo: 'inserir', valor: TSI.sincronizacao.novoItem(reg, 'atualizar') }].concat(H().operacoes([ev]));
        return repo().lote(ops).then(function () {
          TSI.eventos.emitir('registros:alterado', { id: reg.id });
          TSI.sincronizacao.processar().catch(function (e) { console.error('[sincronização]', e); });
          return reg;
        });
      });
    },

    /* ---------- Rascunho: registro em andamento do operador ---------- */
    obterRascunho: function (usuarioId) { return repo().rascunhos.obter(usuarioId); },
    salvarRascunho: function (r) {
      r.atualizadoEm = util.agora();
      return repo().rascunhos.salvar(r);
    },
    descartarRascunho: function (usuarioId) { return repo().rascunhos.remover(usuarioId); },

    /** URL temporária para exibir uma fotografia guardada. Quem pede deve liberar com URL.revokeObjectURL. */
    urlDaFoto: function (foto) {
      return URL.createObjectURL(new Blob([foto.dados], { type: foto.tipo || 'image/jpeg' }));
    }
  };
})(window);
