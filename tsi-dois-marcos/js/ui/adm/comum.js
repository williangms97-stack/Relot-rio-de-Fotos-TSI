/* ==========================================================================
   Peças compartilhadas do painel: linha do tempo de alterações,
   janela do registro fotográfico (com GERAR PDF) e correção pelo ADM
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, util, config: cfg } = TSI;
  const { html, icone } = ui;
  const adm = TSI.telas.adm;

  /** Linha do tempo de eventos de auditoria. */
  adm.eventosHtml = function (eventos) {
    if (!eventos.length) return html`<p class="texto-menor">Nenhuma alteração registrada.</p>`;
    return html`
      <ol class="linha-tempo">
        ${eventos.map((e) => html`
          <li>
            <div class="lt-topo"><strong>${TSI.historico.ROTULO_ACAO[e.acao] || e.acao}</strong><span>${util.fmtDataHora(e.dataHora)} · ${e.usuarioNome}</span></div>
            ${e.campo ? html`<p>${e.campo}: ${e.valorAnterior !== null ? html`<s>${e.valorAnterior}</s> → ` : ''}<b>${e.valorNovo === null ? '—' : e.valorNovo}</b></p>` : ''}
            ${e.motivo ? html`<p class="texto-menor">Motivo: ${e.motivo}</p>` : ''}
          </li>`)}
      </ol>`;
  };

  function resumoVerificacao(v) {
    if (!v) return '';
    const luz = { ok: 'iluminação adequada', escura: 'foto escura', clara: 'foto clara demais', nao_avaliada: 'iluminação não avaliada' };
    const foco = { ok: 'nitidez adequada', baixa: 'possível desfoque', nao_avaliada: 'nitidez não avaliada' };
    return ' · verificação básica: ' + luz[v.iluminacao] + ', ' + foco[v.nitidez];
  }

  /** Correção do registro pelo ADM (quantidade, máquina e justificativa), com motivo obrigatório. */
  function abrirEdicao(reg, aoSalvar) {
    TSI.maquinas.listar().then((maquinas) => {
      const opcoes = maquinas.filter((m) => m.ativa || m.id === reg.maquinaId).map((m) => ({ valor: m.id, rotulo: m.nome + (m.ativa ? '' : ' (inativa)') }));
      const m = ui.modal({
        titulo: 'Corrigir registro: ' + TSI.ordens.rotulo(reg), largura: 'm',
        conteudo: html`
          <form id="form-edicao" class="formulario" novalidate>
            <p class="texto-menor">Quantidade prevista no RQ70: <strong>${TSI.ordens.fmtQtd(reg.qtdPrevista, reg.ordem)}</strong>. Cada campo alterado fica no histórico com o valor anterior e o novo.</p>
            <div class="formulario-linha">
              <div class="campo"><label for="edicao-qtd">Quantidade efetivamente tratada</label>
                <input id="edicao-qtd" type="text" inputmode="decimal" autocomplete="off" value="${String(reg.qtdEfetiva).replace('.', ',')}"></div>
              <div class="campo"><label for="edicao-maquina">Máquina</label><select id="edicao-maquina">${ui.opcoes(opcoes, reg.maquinaId)}</select></div>
            </div>
            <div id="edicao-divergencia" hidden>
              <div class="campo"><label for="edicao-motivo">Motivo da divergência de quantidade</label>
                <select id="edicao-motivo">${ui.opcoes(cfg.MOTIVOS_DIVERGENCIA, reg.motivoDivergencia || '', 'Selecione…')}</select></div>
              <div class="campo"><label for="edicao-descricao">Descrição complementar</label>
                <textarea id="edicao-descricao" rows="2" maxlength="300">${reg.descricaoDivergencia || ''}</textarea></div>
            </div>
            <div class="campo"><label for="edicao-justificativa">Motivo da correção</label>
              <textarea id="edicao-justificativa" rows="2" maxlength="300" placeholder="Por que o registro está sendo corrigido"></textarea></div>
            <p class="form-erro" id="edicao-erro" role="alert" hidden></p>
          </form>`,
        acoes: [
          { rotulo: 'Voltar', classe: 'btn-secundario', acao: (mm) => mm.fechar() },
          { rotulo: 'Salvar correção', classe: 'btn-primario', id: 'edicao-salvar', acao: (mm, botao) => {
            const q = (s) => mm.corpo.querySelector(s);
            ui.ocupar(botao, () => TSI.registros.editar(reg.id, {
              qtdEfetiva: q('#edicao-qtd').value, maquinaId: q('#edicao-maquina').value,
              motivoDivergencia: q('#edicao-motivo').value, descricaoDivergencia: q('#edicao-descricao').value
            }, q('#edicao-justificativa').value).then(() => { mm.fechar(); ui.aviso('Registro corrigido. A alteração está no histórico.', 'ok'); aoSalvar(); }))
              .catch((e) => { const er = q('#edicao-erro'); er.textContent = ui.mensagemDe(e); er.hidden = false; if (!e || !e.amigavel) console.error(e); });
          } }
        ]
      });
      const qtd = m.corpo.querySelector('#edicao-qtd'), bloco = m.corpo.querySelector('#edicao-divergencia');
      const conferir = () => {
        const n = util.paraNumero(qtd.value);
        bloco.hidden = !(n !== null && TSI.registros.haDivergencia(reg.qtdPrevista, n));
      };
      qtd.addEventListener('input', conferir);
      conferir();
    }).catch(ui.erro);
  }

  /** Janela com o registro completo: fotografias, dados, GERAR PDF, correção, anulação e histórico. */
  adm.abrirRegistro = function (id) {
    const urls = ui.GerenteUrls();
    const m = ui.modal({ titulo: 'Registro fotográfico', largura: 'xg', conteudo: html`<p class="texto-menor">Carregando…</p>`, aoFechar: () => urls.liberar() });

    function carregar() {
      return Promise.all([TSI.registros.obter(id), TSI.registros.fotosDe(id), TSI.historico.daEntidade('registro', id)]).then((r) => {
        const reg = r[0], fotos = r[1], eventos = r[2];
        if (!reg) { m.definirConteudo(html`<p>Registro não encontrado.</p>`); return; }
        urls.liberar();
        const lista = fotos.map((f) => ({ foto: f, url: urls.daFoto(f) }));
        const principal = lista[0];
        m.definirConteudo(html`
          <div class="registro">
            <div class="registro-fotos">
              ${principal ? html`<img class="registro-foto" id="registro-foto" src="${principal.url}" alt="Fotografia da amostra de sementes tratadas">` : html`<p>Registro sem fotografia.</p>`}
              <p class="texto-menor" id="registro-foto-legenda">${principal ? legenda(principal.foto, 0) : ''}</p>
              ${lista.length > 1 ? html`
                <div class="registro-miniaturas" role="group" aria-label="Fotografias do registro">
                  ${lista.map((f, i) => html`<button type="button" data-foto="${i}" class="${i === 0 ? 'ativa' : ''}" aria-label="${i === 0 ? 'Fotografia principal' : 'Fotografia complementar ' + i}"><img src="${f.foto.miniatura}" alt=""></button>`)}
                </div>` : ''}
            </div>
            <div class="registro-info">
              <div class="registro-topo">
                <div><span class="texto-menor">Ordem de tratamento</span><strong>${TSI.ordens.numeroOrdem(reg)}</strong></div>
                <div class="registro-selos">
                  ${reg.anulado ? ui.seloSimples('Anulado', 'selo-cancelada', 'anular') : ui.seloEnvio(reg.situacaoEnvio)}
                  ${reg.divergencia ? ui.seloSimples('Divergência de quantidade', 'selo-pendente', 'alerta') : ''}
                  ${reg.corrigidoEm ? ui.seloSimples('Corrigido pelo ADM', 'selo-neutro', 'editar') : ''}
                </div>
              </div>
              ${reg.anulado ? html`<div class="alerta alerta-erro">${icone('anular', 20)}<div><strong>Registro anulado</strong>
                <p>${util.fmtDataHora(reg.anulado.em)} · ${reg.anulado.porNome} · ${reg.anulado.motivo}</p></div></div>` : ''}
              ${ui.dados(ui.paresDoRegistro(reg).slice(1).concat([
                ['Categoria', (reg.ordem || {}).categoria], ['Peneira', (reg.ordem || {}).peneira],
                { rotulo: 'Protocolo', valor: reg.protocolo, largo: true }]), 'dados-2col')}
              <div class="registro-acoes">
                <button type="button" class="btn btn-primario" data-acao="pdf" id="registro-pdf">${icone('pdf', 18)}<span>GERAR PDF</span></button>
                ${!reg.anulado && TSI.auth.ehAdm() ? html`
                  <button type="button" class="btn btn-secundario" data-acao="editar">${icone('editar', 18)}<span>Corrigir</span></button>
                  <button type="button" class="btn btn-perigo-suave" data-acao="anular">${icone('anular', 18)}<span>Anular</span></button>` : ''}
              </div>
              <h3 class="secao-titulo">Histórico de alterações</h3>
              ${adm.eventosHtml(eventos)}
            </div>
          </div>`);

        m.corpo.onclick = (ev) => {
          const mini = ev.target.closest('[data-foto]');
          if (mini) {
            const i = Number(mini.dataset.foto);
            m.corpo.querySelector('#registro-foto').src = lista[i].url;
            m.corpo.querySelector('#registro-foto-legenda').textContent = legenda(lista[i].foto, i);
            m.corpo.querySelectorAll('[data-foto]').forEach((b) => b.classList.toggle('ativa', b === mini));
            return;
          }
          const b = ev.target.closest('[data-acao]');
          if (!b) return;
          if (b.dataset.acao === 'pdf') ui.gerarPdf(reg.id, b);
          else if (b.dataset.acao === 'editar') abrirEdicao(reg, carregar);
          else if (b.dataset.acao === 'anular') {
            ui.confirmar({
              titulo: 'Anular o registro de ' + TSI.ordens.rotulo(reg) + '?',
              mensagem: 'O registro e as fotografias continuam guardados e visíveis no histórico, mas deixam de valer. A ordem volta a ficar pendente e poderá receber um novo registro.',
              rotuloConfirmar: 'Anular registro', perigo: true, motivo: { rotulo: 'Motivo da anulação', obrigatorio: true }
            }).then((resp) => {
              if (!resp) return;
              return TSI.registros.anular(reg.id, resp.motivo).then(() => { ui.aviso('Registro anulado. ' + TSI.ordens.rotulo(reg) + ' voltou a ficar pendente.', 'ok'); return carregar(); });
            }).catch(ui.erro);
          }
        };
      }).catch(ui.erro);
    }
    function legenda(f, i) {
      return (i === 0 ? 'Fotografia principal' : 'Fotografia complementar ' + i) + ' · ' + util.fmtDataHora(f.capturadaEm, true) + ' · ' + f.largura + '×' + f.altura + ' px' + resumoVerificacao(f.verificacao);
    }
    carregar();
    return m;
  };
})(window);
