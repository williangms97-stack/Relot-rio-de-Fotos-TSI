/* ==========================================================================
   Base da interface: HTML seguro, ícones, avisos, janelas, selos e paginação
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { util, config: cfg } = TSI;
  const ui = TSI.ui = {};
  TSI.telas = TSI.telas || { adm: {} };

  /* ---------- HTML seguro ----------
     ui.html`<p>${valor}</p>` escapa todo valor interpolado (dados da planilha, nomes,
     motivos digitados). Só o que vier de ui.html/ui.bruto entra sem escape. */
  function Bruto(s) { this.s = s; }
  Bruto.prototype.toString = function () { return this.s; };
  function inserir(v) {
    if (v === null || v === undefined || v === false || v === true) return '';
    if (v instanceof Bruto) return v.s;
    if (Array.isArray(v)) return v.map(inserir).join('');
    return util.esc(v);
  }
  ui.bruto = (s) => new Bruto(s === null || s === undefined ? '' : String(s));
  ui.html = function (partes) {
    let s = partes[0];
    for (let i = 1; i < arguments.length; i++) s += inserir(arguments[i]) + partes[i];
    return new Bruto(s);
  };
  const html = ui.html;

  /* ---------- Ícones (traço simples, herdam a cor do texto) ---------- */
  const NUVEM = '<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.6a4 4 0 0 1-.5 7.9z"/>';
  const ICONES = {
    painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    camera: '<path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.2" r="3.4"/>',
    ordens: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
    planilha: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h7M12 11v8"/>',
    maquina: '<path d="M3 21V10l6 4v-4l6 4V5h4a1 1 0 0 1 1 1v15z"/><path d="M8 17h2M13 17h2"/>',
    usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.2 14.9c1.8.8 2.9 2.5 3.3 5.1"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 3.9-6.5 8-6.5s7.2 2.3 8 6.5"/>',
    historico: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4.5v4h4M12 7.5V12l3 2"/>',
    sair: '<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9"/>',
    buscar: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    checkCirculo: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.8 5.4-5.6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    alerta: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.4v.1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    nuvem: NUVEM,
    nuvemOk: NUVEM + '<path d="m9.5 13.5 2 2 3.5-3.6"/>',
    nuvemErro: NUVEM + '<path d="M12 11v3M12 16.4v.1"/>',
    editar: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14.5 7.5 3 3"/>',
    anular: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
    pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9.2 14.4 12 17l2.8-2.6"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    menos: '<path d="M5 12h14"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    voltar: '<path d="M15 5l-7 7 7 7"/>',
    avancar: '<path d="m9 5 7 7-7 7"/>',
    baixo: '<path d="m6 9 6 6 6-6"/>',
    filtro: '<path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8z"/>',
    olho: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    olhoOff: '<path d="M4 4l16 16M9.9 5.8A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.3 7.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.6-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    celular: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.4h2"/>',
    desfazer: '<path d="M8 5 3.5 9.5 8 14"/><path d="M3.5 9.5H14a6 6 0 0 1 0 12h-3"/>',
    cadeado: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    upload: '<path d="M12 16V4M7 8.5l5-5 5 5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    tabela: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9.5h18M3 14.5h18M9 4.5v15"/>',
    grafico: '<path d="M4 20V4M4 20h16M8 16v-5M12.5 16V8M17 16v-8"/>',
    atualizar: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
    compartilhar: '<circle cx="6" cy="12" r="2.5"/><circle cx="17.5" cy="6" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="m8.2 10.9 7-3.7M8.2 13.1l7 3.7"/>',
    imagem: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.7" r="1.6"/><path d="m4 17.5 5-4.6 3.6 3.2 2.6-2.3 4.8 4.2"/>',
    lixeira: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5l.8-12"/>',
    semRede: '<path d="M3 3l18 18M8.5 16.3a5 5 0 0 1 7 0M5.2 12.9a9.6 9.6 0 0 1 4-2.4M14 10.3a9.6 9.6 0 0 1 4.8 2.6M2 9.4a14.5 14.5 0 0 1 4.3-2.9M10.4 5A14.6 14.6 0 0 1 22 9.4M12 19.6v.1"/>',
    banco: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>'
  };
  ui.icone = (nome, tam) => new Bruto('<svg class="icone" width="' + (tam || 20) + '" height="' + (tam || 20) +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    (ICONES[nome] || '') + '</svg>');
  const icone = ui.icone;

  /* ---------- Avisos rápidos ---------- */
  function areaAvisos() {
    let a = document.getElementById('avisos');
    if (!a) {
      a = document.createElement('div');
      a.id = 'avisos'; a.className = 'avisos';
      a.setAttribute('role', 'status'); a.setAttribute('aria-live', 'polite');
      document.body.appendChild(a);
    }
    return a;
  }
  ui.aviso = function (mensagem, tipo, ms) {
    const el = document.createElement('div');
    const t = tipo || 'info';
    el.className = 'aviso aviso-' + t;
    el.innerHTML = html`${icone(t === 'ok' ? 'checkCirculo' : t === 'erro' ? 'alerta' : t === 'alerta' ? 'alerta' : 'info', 20)}<span>${mensagem}</span>`;
    areaAvisos().appendChild(el);
    setTimeout(() => { el.classList.add('saindo'); setTimeout(() => el.remove(), 250); }, ms || (t === 'erro' ? 6500 : 4200));
  };
  /** Mostra o erro em linguagem clara; erros inesperados vão também para o console. */
  ui.erro = function (e) {
    if (e && e.amigavel) { ui.aviso(e.message, 'erro'); return; }
    console.error(e);
    ui.aviso('Algo não funcionou como esperado. Tente novamente.' + (e && e.message ? ' (' + e.message + ')' : ''), 'erro');
  };
  ui.mensagemDe = (e) => (e && e.amigavel ? e.message : 'Algo não funcionou como esperado. Tente novamente.');

  /* ---------- Espera em tela cheia ---------- */
  ui.carregando = function (mensagem) {
    const el = document.createElement('div');
    el.className = 'espera';
    el.innerHTML = html`<div class="espera-caixa" role="alert" aria-busy="true"><span class="girando"></span><span>${mensagem || 'Aguarde…'}</span></div>`;
    document.body.appendChild(el);
    return () => el.remove();
  };

  /* ---------- Janela modal ---------- */
  const pilhaModais = [];
  ui.modal = function (op) {
    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    const idTitulo = 'modal-titulo-' + (pilhaModais.length + 1);
    fundo.innerHTML = html`
      <div class="modal modal-${op.largura || 'm'}" role="dialog" aria-modal="true" aria-labelledby="${idTitulo}">
        <header class="modal-topo">
          <h2 id="${idTitulo}">${op.titulo}</h2>
          <button type="button" class="btn-icone" data-modal-fechar aria-label="Fechar">${icone('x', 22)}</button>
        </header>
        <div class="modal-corpo"></div>
        <footer class="modal-acoes" hidden></footer>
      </div>`;
    const corpo = fundo.querySelector('.modal-corpo'), rodape = fundo.querySelector('.modal-acoes');
    const focoAnterior = document.activeElement;
    let fechado = false;
    const m = {
      el: fundo, corpo: corpo,
      definirConteudo(c) { corpo.innerHTML = c; },
      definirAcoes(acoes) {
        rodape.innerHTML = '';
        rodape.hidden = !acoes || !acoes.length;
        (acoes || []).forEach((a) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn ' + (a.classe || 'btn-secundario');
          if (a.id) b.id = a.id;
          b.innerHTML = html`${a.icone ? icone(a.icone, 18) : ''}<span>${a.rotulo}</span>`;
          b.addEventListener('click', () => a.acao && a.acao(m, b));
          rodape.appendChild(b);
        });
      },
      fechar(resultado) {
        if (fechado) return;
        fechado = true;
        fundo.remove();
        const i = pilhaModais.indexOf(m);
        if (i >= 0) pilhaModais.splice(i, 1);
        if (!pilhaModais.length) document.body.classList.remove('com-modal');
        if (focoAnterior && focoAnterior.focus && document.contains(focoAnterior)) focoAnterior.focus();
        if (op.aoFechar) op.aoFechar(resultado);
      }
    };
    m.definirConteudo(op.conteudo || '');
    m.definirAcoes(op.acoes);
    fundo.addEventListener('mousedown', (ev) => { if (ev.target === fundo && op.fecharNoFundo !== false) m.fechar(); });
    fundo.addEventListener('click', (ev) => { if (ev.target.closest('[data-modal-fechar]')) m.fechar(); });
    document.body.appendChild(fundo);
    document.body.classList.add('com-modal');
    pilhaModais.push(m);
    const alvo = fundo.querySelector('[autofocus]') || corpo.querySelector('input:not([type=hidden]), select, textarea') || fundo.querySelector('.modal-acoes .btn-primario') || fundo.querySelector('[data-modal-fechar]');
    if (alvo) setTimeout(() => alvo.focus(), 30);
    return m;
  };
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && pilhaModais.length) { ev.preventDefault(); pilhaModais[pilhaModais.length - 1].fechar(); }
  });

  /**
   * Pergunta de confirmação, com motivo opcional ou obrigatório.
   * Resolve com null (desistiu) ou { motivo }.
   */
  ui.confirmar = function (op) {
    return new Promise((resolver) => {
      let resposta = null;
      const mot = op.motivo;
      const m = ui.modal({
        titulo: op.titulo, largura: 'p',
        conteudo: html`
          <div class="confirmacao">
            ${op.mensagem ? html`<p>${op.mensagem}</p>` : ''}
            ${op.detalhe ? html`<p class="texto-menor">${op.detalhe}</p>` : ''}
            ${mot ? html`
              <div class="campo">
                <label for="confirmar-motivo">${mot.rotulo}${mot.obrigatorio ? '' : html` <span class="opcional">(opcional)</span>`}</label>
                <textarea id="confirmar-motivo" rows="3" maxlength="300" placeholder="${mot.dica || ''}"></textarea>
                <p class="form-erro" id="confirmar-erro" role="alert" hidden></p>
              </div>` : ''}
          </div>`,
        acoes: [
          { rotulo: 'Voltar', classe: 'btn-secundario', acao: (mm) => mm.fechar() },
          { rotulo: op.rotuloConfirmar || 'Confirmar', classe: op.perigo ? 'btn-perigo' : 'btn-primario', id: 'confirmar-ok', acao: (mm) => {
            let motivo = '';
            if (mot) {
              motivo = util.limpar(mm.corpo.querySelector('#confirmar-motivo').value);
              const minimo = mot.minimo || 5;
              if (mot.obrigatorio && motivo.length < minimo) {
                const er = mm.corpo.querySelector('#confirmar-erro');
                er.textContent = 'Informe o motivo (mínimo de ' + minimo + ' caracteres).';
                er.hidden = false;
                mm.corpo.querySelector('#confirmar-motivo').focus();
                return;
              }
            }
            resposta = { motivo: motivo };
            mm.fechar();
          } }
        ],
        aoFechar: () => resolver(resposta)
      });
      return m;
    });
  };

  /* ---------- Selos de situação (sempre ícone + texto, nunca só cor) ---------- */
  const ICONE_ORDEM = { registrada: 'checkCirculo', pendente: 'relogio', cancelada: 'x', desconsiderada: 'anular' };
  ui.seloOrdem = (s) => html`<span class="selo selo-${s}">${icone(ICONE_ORDEM[s] || 'info', 14)}${cfg.ROTULO_SITUACAO_ORDEM[s] || s}</span>`;
  const ICONE_ENVIO = { aguardando: 'relogio', sincronizado: 'nuvemOk', falha: 'nuvemErro' };
  ui.seloEnvio = (s) => html`<span class="selo selo-envio-${s}">${icone(ICONE_ENVIO[s] || 'info', 14)}${cfg.ROTULO_SITUACAO_ENVIO[s] || s}</span>`;
  ui.seloSimples = (texto, classe, nomeIcone) => html`<span class="selo ${classe || 'selo-neutro'}">${nomeIcone ? icone(nomeIcone, 14) : ''}${texto}</span>`;

  /* ---------- Paginação ---------- */
  ui.paginar = function (lista, pagina, porPagina) {
    const pp = porPagina || cfg.ITENS_POR_PAGINA;
    const paginas = Math.max(1, Math.ceil(lista.length / pp));
    const p = Math.min(Math.max(1, pagina || 1), paginas);
    return { itens: lista.slice((p - 1) * pp, p * pp), pagina: p, paginas: paginas, total: lista.length, inicio: lista.length ? (p - 1) * pp + 1 : 0, fim: Math.min(p * pp, lista.length) };
  };
  ui.paginacao = function (pg, rotuloItens) {
    if (!pg.total) return '';
    return html`
      <div class="paginacao">
        <span>${util.fmtNum(pg.inicio, 0)}–${util.fmtNum(pg.fim, 0)} de ${util.fmtNum(pg.total, 0)} ${rotuloItens || ''}</span>
        ${pg.paginas > 1 ? html`
          <div class="paginacao-botoes">
            <button type="button" class="btn btn-secundario btn-p" data-acao="pagina" data-pagina="${pg.pagina - 1}" ${pg.pagina <= 1 ? ui.bruto('disabled') : ''}>${icone('voltar', 16)}<span>Anterior</span></button>
            <span class="paginacao-atual">Página ${pg.pagina} de ${pg.paginas}</span>
            <button type="button" class="btn btn-secundario btn-p" data-acao="pagina" data-pagina="${pg.pagina + 1}" ${pg.pagina >= pg.paginas ? ui.bruto('disabled') : ''}><span>Próxima</span>${icone('avancar', 16)}</button>
          </div>` : ''}
      </div>`;
  };

  /* ---------- Diversos ---------- */
  ui.vazio = (nomeIcone, titulo, texto, acao) => html`
    <div class="vazio">
      <span class="vazio-icone">${icone(nomeIcone, 30)}</span>
      <h3>${titulo}</h3>
      ${texto ? html`<p>${texto}</p>` : ''}
      ${acao || ''}
    </div>`;

  ui.opcoes = (lista, selecionado, rotuloVazio) => html`
    ${rotuloVazio !== undefined ? html`<option value="">${rotuloVazio}</option>` : ''}
    ${lista.map((o) => {
      const valor = typeof o === 'object' ? o.valor : o, rotulo = typeof o === 'object' ? o.rotulo : o;
      return html`<option value="${valor}" ${String(valor) === String(selecionado) ? ui.bruto('selected') : ''}>${rotulo}</option>`;
    })}`;

  /** Controla URLs temporárias de fotografias e as libera ao sair da tela. */
  ui.GerenteUrls = function () {
    const urls = [];
    return {
      daFoto(foto) { const u = TSI.registros.urlDaFoto(foto); urls.push(u); return u; },
      liberar() { urls.splice(0).forEach((u) => URL.revokeObjectURL(u)); }
    };
  };

  /** Lista "rótulo / valor" para dados da ordem ou do registro. */
  ui.dados = (pares, classe) => html`
    <dl class="dados ${classe || ''}">
      ${pares.filter(Boolean).map((p) => html`<div class="${p.largo ? 'dado-largo' : ''}"><dt>${p[0] || p.rotulo}</dt><dd>${(p[1] !== undefined ? p[1] : p.valor) || '—'}</dd></div>`)}
    </dl>`;

  /** Dados da ordem (RQ70) mostrados ao operador e nos detalhes. */
  ui.paresDaOrdem = function (o) {
    const f = (c) => TSI.ordens.fmtCampo(o, c);
    return [
      ['Data da solicitação', f('data')],
      ['Lote', f('lote')],
      ['Cultura', o.cultura || 'Não identificada'],
      ['Cultivar', f('cultivar')],
      ['Categoria', f('categoria')],
      ['Peneira', f('peneira')],
      ['Armazém', f('armazem')],
      ['Local de produção', f('localProducao')],
      ['Tipo de tratamento', f('tratamento')],
      ['Tipo de embalagem', f('tipoEmbalagem')],
      ['Quantidade prevista', TSI.ordens.fmtQtd(TSI.ordens.qtdPrevista(o), o)],
      ['Peso por embalagem', typeof o.pesoEmbTsi === 'number' ? util.fmtNum(o.pesoEmbTsi, 2) + ' kg' : f('pesoEmbTsi')],
      { rotulo: 'Observações', valor: f('observacoes'), largo: true }
    ];
  };

  /** Dados do registro fotográfico (resumo, detalhe e conferência). */
  ui.paresDoRegistro = function (r) {
    const o = r.ordem || {};
    return [
      ['Ordem de tratamento', TSI.ordens.numeroOrdem(r)],
      ['Lote', o.lote],
      ['Cultivar', o.cultivar],
      ['Tratamento', o.tratamento],
      ['Tipo de embalagem', o.tipoEmbalagem],
      ['Máquina', r.maquinaNome],
      ['Quantidade prevista', TSI.ordens.fmtQtd(r.qtdPrevista, o)],
      ['Quantidade efetivamente tratada', TSI.ordens.fmtQtd(r.qtdEfetiva, o)],
      ['Operador', r.operadorNome],
      ['Data e horário', util.fmtDataHora(r.criadoEm)],
      r.divergencia ? { rotulo: 'Justificativa da divergência', valor: r.motivoDivergencia + (r.descricaoDivergencia ? ' — ' + r.descricaoDivergencia : ''), largo: true } : null
    ];
  };

  ui.delegar = function (raiz, evento, seletor, fn) {
    raiz.addEventListener(evento, (ev) => {
      const alvo = ev.target.closest(seletor);
      if (alvo && raiz.contains(alvo)) fn(ev, alvo);
    });
  };

  /** Desabilita o botão enquanto a ação assíncrona roda (evita envio em dobro). */
  ui.ocupar = function (botao, fn) {
    if (!botao || botao.disabled) return Promise.resolve();
    botao.disabled = true;
    botao.classList.add('ocupado');
    return Promise.resolve().then(fn).then((v) => { liberar(); return v; }, (e) => { liberar(); throw e; });
    function liberar() { botao.disabled = false; botao.classList.remove('ocupado'); }
  };

  /** Gera e entrega o PDF do registro. */
  ui.gerarPdf = function (registroId, botao) {
    return ui.ocupar(botao, () => TSI.pdf.gerar(registroId).then((pdf) => TSI.arquivos.salvar(pdf.blob, pdf.nome).then((r) => {
      if (r === 'salvo') ui.aviso('PDF gerado: ' + pdf.nome, 'ok');
    }))).catch(ui.erro);
  };
  ui.compartilharPdf = function (registroId, botao) {
    return ui.ocupar(botao, () => TSI.pdf.gerar(registroId).then((pdf) => TSI.arquivos.compartilhar(pdf.blob, pdf.nome, 'Inspeção de sementes tratadas'))).catch(ui.erro);
  };
})(window);
