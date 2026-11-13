/* ==========================================================================
   Gráficos do painel (sem biblioteca externa)
   - barras horizontais ordenadas, para comparar categorias (máquina, cultura, operador)
   - colunas no tempo, para registros por período
   Uma única cor por gráfico (série única), valor na ponta da barra, dica ao passar
   o ponteiro ou focar pelo teclado e alternância para tabela.
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, util } = TSI;
  const { html } = ui;
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- Dica flutuante (valor em destaque, rótulo em seguida) ---------- */
  let dica = null;
  function mostrarDica(alvo, valor, rotulo) {
    if (!dica) {
      dica = document.createElement('div');
      dica.className = 'grafico-dica';
      dica.setAttribute('role', 'tooltip');
      document.body.appendChild(dica);
    }
    dica.textContent = '';
    const v = document.createElement('strong'); v.textContent = valor;
    const r = document.createElement('span'); r.textContent = rotulo;
    dica.appendChild(v); dica.appendChild(r);
    dica.hidden = false;
    const a = alvo.getBoundingClientRect(), d = dica.getBoundingClientRect();
    const x = Math.min(Math.max(8, a.left + a.width / 2 - d.width / 2), global.innerWidth - d.width - 8);
    const acima = a.top - d.height - 8;
    dica.style.left = Math.round(x + global.scrollX) + 'px';
    dica.style.top = Math.round((acima < 8 ? a.bottom + 8 : acima) + global.scrollY) + 'px';
  }
  function esconderDica() { if (dica) dica.hidden = true; }
  ui.esconderDica = esconderDica;

  function ligarDicas(raiz) {
    const entrar = (ev) => {
      const m = ev.target.closest('[data-dica-valor]');
      if (m && raiz.contains(m)) mostrarDica(m.dataset.dicaAlvo ? raiz.querySelector(m.dataset.dicaAlvo) || m : m, m.dataset.dicaValor, m.dataset.dicaRotulo);
    };
    raiz.addEventListener('pointerover', entrar);
    raiz.addEventListener('focusin', entrar);
    raiz.addEventListener('pointerout', esconderDica);
    raiz.addEventListener('focusout', esconderDica);
  }

  const unid = (n, u) => util.fmtNum(n, 0) + ' ' + (n === 1 ? u[0] : u[1]);

  /** Barras horizontais ordenadas da maior para a menor. dados: [{ rotulo, valor }] */
  ui.graficoBarras = function (alvo, dados, op) {
    op = op || {};
    const u = op.unidade || ['registro', 'registros'], limite = op.maximo || 8;
    let lista = dados.filter((d) => d.valor > 0).sort((a, b) => b.valor - a.valor || util.compararNatural(a.rotulo, b.rotulo));
    if (!lista.length) { alvo.innerHTML = html`<p class="grafico-vazio">${op.vazio || 'Sem registros no filtro atual.'}</p>`; return; }
    if (lista.length > limite) {
      const resto = lista.slice(limite - 1);
      lista = lista.slice(0, limite - 1).concat([{ rotulo: 'Outros (' + resto.length + ')', valor: resto.reduce((s, d) => s + d.valor, 0) }]);
    }
    const max = Math.max.apply(null, lista.map((d) => d.valor)), total = lista.reduce((s, d) => s + d.valor, 0);
    alvo.innerHTML = html`
      <div class="barras" role="list">
        ${lista.map((d) => html`
          <div class="barra" role="listitem" tabindex="0" aria-label="${d.rotulo}: ${unid(d.valor, u)}"
               data-dica-valor="${unid(d.valor, u)}" data-dica-rotulo="${d.rotulo} · ${util.fmtPct(d.valor / total * 100)} do total">
            <span class="barra-rotulo">${d.rotulo}</span>
            <span class="barra-trilha" style="--p:${(d.valor / max).toFixed(4)}"><span class="barra-marca"></span><span class="barra-valor">${util.fmtNum(d.valor, 0)}</span></span>
          </div>`)}
      </div>`;
    if (!alvo.dataset.dicas) { alvo.dataset.dicas = '1'; ligarDicas(alvo); }
  };

  function passoLimpo(max) {
    const bruto = max / 4, pot = Math.pow(10, Math.floor(Math.log10(Math.max(bruto, 1))));
    const n = bruto / pot, passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pot;
    return Math.max(1, passo);
  }
  function svg(nome, attrs, texto) {
    const e = document.createElementNS(NS, nome);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  /** Colunas no tempo. dados em ordem cronológica: [{ rotulo, titulo, valor }] */
  ui.graficoColunas = function (alvo, dados, op) {
    op = op || {};
    const u = op.unidade || ['registro', 'registros'];
    if (!dados.length || !dados.some((d) => d.valor > 0)) { alvo.innerHTML = html`<p class="grafico-vazio">${op.vazio || 'Sem registros no filtro atual.'}</p>`; return; }
    const L = Math.max(280, Math.floor(alvo.clientWidth || 560)), A = 216, m = { t: 18, d: 8, b: 26, e: 34 };
    const larg = L - m.e - m.d, alt = A - m.t - m.b, n = dados.length;
    const max = Math.max.apply(null, dados.map((d) => d.valor)), passo = passoLimpo(max), topo = Math.ceil(max / passo) * passo;
    const y = (v) => m.t + alt - (v / topo) * alt;
    const faixa = larg / n, w = Math.max(2, Math.min(24, faixa - 2));
    const raiz = svg('svg', { viewBox: '0 0 ' + L + ' ' + A, width: L, height: A, class: 'colunas', role: 'img', 'aria-label': op.descricao || 'Registros por período' });

    for (let v = 0; v <= topo + 1e-9; v += passo) {
      raiz.appendChild(svg('line', { x1: m.e, x2: L - m.d, y1: y(v), y2: y(v), class: v === 0 ? 'eixo' : 'grade' }));
      raiz.appendChild(svg('text', { x: m.e - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'tique' }, util.fmtNum(v, 0)));
    }
    const cada = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(larg / 54))));
    const iMax = dados.reduce((im, d, i) => (d.valor > dados[im].valor ? i : im), 0);
    dados.forEach((d, i) => {
      const cx = m.e + faixa * i + faixa / 2, x0 = cx - w / 2, yv = y(d.valor), base = m.t + alt, h = base - yv;
      if (d.valor > 0) {
        const r = Math.min(4, w / 2, h);
        raiz.appendChild(svg('path', { class: 'coluna', 'data-i': i,
          d: 'M' + x0 + ' ' + base + 'V' + (yv + r) + 'Q' + x0 + ' ' + yv + ' ' + (x0 + r) + ' ' + yv + 'H' + (x0 + w - r) + 'Q' + (x0 + w) + ' ' + yv + ' ' + (x0 + w) + ' ' + (yv + r) + 'V' + base + 'Z' }));
      }
      if (i === iMax) raiz.appendChild(svg('text', { x: Math.min(Math.max(cx, m.e + 10), L - m.d - 10), y: yv - 5, 'text-anchor': 'middle', class: 'rotulo-valor' }, util.fmtNum(d.valor, 0)));
      if (i % cada === 0) raiz.appendChild(svg('text', { x: cx, y: A - 8, 'text-anchor': i === 0 && n > 6 ? 'start' : 'middle', class: 'tique' }, d.rotulo));
      // área de toque maior que a coluna: a faixa inteira responde ao ponteiro e ao teclado
      const alvoToque = svg('rect', { x: m.e + faixa * i, y: m.t, width: faixa, height: alt, class: 'toque', tabindex: 0, role: 'img',
        'aria-label': (d.titulo || d.rotulo) + ': ' + unid(d.valor, u), 'data-dica-valor': unid(d.valor, u), 'data-dica-rotulo': d.titulo || d.rotulo, 'data-i': i });
      if (d.valor > 0) alvoToque.setAttribute('data-dica-alvo', '.coluna[data-i="' + i + '"]');   // a dica aparece sobre a coluna
      raiz.appendChild(alvoToque);
    });
    alvo.innerHTML = '';
    alvo.appendChild(raiz);
    if (!alvo.dataset.dicas) {
      alvo.dataset.dicas = '1';
      ligarDicas(alvo);
      const realce = (ev, ligado) => {
        const t = ev.target.closest('.toque');
        if (!t) return;
        const c = alvo.querySelector('.coluna[data-i="' + t.getAttribute('data-i') + '"]');
        if (c) c.classList.toggle('ativa', ligado);
      };
      alvo.addEventListener('pointerover', (ev) => realce(ev, true));
      alvo.addEventListener('pointerout', (ev) => realce(ev, false));
      alvo.addEventListener('focusin', (ev) => realce(ev, true));
      alvo.addEventListener('focusout', (ev) => realce(ev, false));
    }
  };

  /** Versão em tabela do mesmo conjunto de dados (toda informação do gráfico, sem depender de cor ou ponteiro). */
  ui.graficoTabela = function (alvo, dados, colunas) {
    if (!dados.length) { alvo.innerHTML = html`<p class="grafico-vazio">Sem registros no filtro atual.</p>`; return; }
    alvo.innerHTML = html`
      <div class="tabela-rolagem grafico-tabela">
        <table class="tabela tabela-compacta">
          <thead><tr><th>${colunas[0]}</th><th class="num">${colunas[1]}</th></tr></thead>
          <tbody>${dados.map((d) => html`<tr><td>${d.titulo || d.rotulo}</td><td class="num">${util.fmtNum(d.valor, 0)}</td></tr>`)}</tbody>
        </table>
      </div>`;
  };
})(window);
