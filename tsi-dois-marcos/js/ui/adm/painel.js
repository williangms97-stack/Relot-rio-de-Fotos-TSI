/* ==========================================================================
   Painel (dashboard): indicadores, cobertura fotográfica, gráficos e filtros
   Cobertura = ordens registradas ÷ ordens elegíveis × 100
   (canceladas e desconsideradas não entram no cálculo)
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, util, config: cfg } = TSI;
  const { html, icone } = ui;
  const SIT = cfg.SITUACAO_ORDEM;
  const SEM_CULTURA = 'Não identificada';

  // Filtros e modo de exibição ficam guardados enquanto o painel estiver aberto nesta sessão
  const F = { periodo: 'tudo', de: '', ate: '', situacao: '', cultura: '', cultivar: '', maquina: '', operador: '', lote: '', ordem: '', temOrdem: '' };
  const emTabela = { periodo: false, maquina: false, cultura: false, operador: false };

  function meioDia(iso) { const p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function somarDias(iso, n) { const d = meioDia(iso); d.setDate(d.getDate() + n); return util.dataLocal(d); }

  function intervalo() {
    const hoje = util.dataLocal();
    if (F.periodo === '7' || F.periodo === '30' || F.periodo === '90') return { de: somarDias(hoje, -(+F.periodo - 1)), ate: hoje };
    if (F.periodo === 'mes') return { de: hoje.slice(0, 8) + '01', ate: hoje };
    if (F.periodo === 'personalizado') return { de: F.de, ate: F.ate };
    return { de: '', ate: '' };
  }

  function filtrar(itens) {
    const iv = intervalo(), ordem = TSI.ordens.normalizarNumero(F.ordem);
    return itens.filter((i) => {
      const o = i.ordem, r = i.registro;
      if (iv.de && (!o.data || o.data < iv.de)) return false;
      if (iv.ate && (!o.data || o.data > iv.ate)) return false;
      if (F.situacao && i.situacao !== F.situacao) return false;
      if (F.cultura && (o.cultura || SEM_CULTURA) !== F.cultura) return false;
      if (F.cultivar && o.cultivar !== F.cultivar) return false;
      if (F.lote && !util.contem(o.lote || '', F.lote)) return false;
      if (ordem && (o.ordemTsi || '').indexOf(ordem) < 0) return false;
      if (F.temOrdem === 'sim' && !o.ordemTsi) return false;
      if (F.temOrdem === 'nao' && o.ordemTsi) return false;
      if (F.maquina && (!r || r.maquinaId !== F.maquina)) return false;
      if (F.operador && (!r || r.operadorId !== F.operador)) return false;
      return true;
    });
  }

  function contar(lista, fnChave, fnRotulo) {
    const mapa = new Map();
    lista.forEach((x) => { const k = fnChave(x); if (!mapa.has(k)) mapa.set(k, { rotulo: fnRotulo(x), valor: 0 }); mapa.get(k).valor++; });
    return Array.from(mapa.values());
  }

  /** Registros agrupados por dia, semana ou mês, conforme o intervalo coberto. */
  function seriePorPeriodo(registros) {
    if (!registros.length) return { dados: [], unidade: 'dia' };
    const dias = registros.map((r) => util.dataLocal(new Date(r.criadoEm))).sort();
    const fim = dias[dias.length - 1];
    let ini = dias[0];
    const total = Math.round((meioDia(fim) - meioDia(ini)) / 86400000) + 1;
    const porDia = {};
    dias.forEach((d) => { porDia[d] = (porDia[d] || 0) + 1; });
    const dados = [];
    if (total <= 45) {
      if (total < 14) ini = somarDias(fim, -13);
      for (let d = ini; d <= fim; d = somarDias(d, 1)) dados.push({ rotulo: d.slice(8) + '/' + d.slice(5, 7), titulo: util.fmtData(d), valor: porDia[d] || 0 });
      return { dados: dados, unidade: 'dia' };
    }
    const porGrupo = new Map(), mensal = total > 182;
    const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    for (let d = ini; d <= fim; d = somarDias(d, 1)) {
      let chave, rotulo, titulo;
      if (mensal) {
        chave = d.slice(0, 7); rotulo = MESES[+d.slice(5, 7) - 1] + '/' + d.slice(2, 4); titulo = rotulo;
      } else {
        const dt = meioDia(d), seg = somarDias(d, -((dt.getDay() + 6) % 7));
        chave = seg; rotulo = seg.slice(8) + '/' + seg.slice(5, 7); titulo = 'Semana de ' + util.fmtData(seg);
      }
      if (!porGrupo.has(chave)) porGrupo.set(chave, { rotulo: rotulo, titulo: titulo, valor: 0 });
      porGrupo.get(chave).valor += porDia[d] || 0;
    }
    return { dados: Array.from(porGrupo.values()), unidade: mensal ? 'mês' : 'semana' };
  }

  TSI.telas.adm.painel = {
    montar(el, ctx) {
      let visao = [], maquinas = [], montado = true;

      el.innerHTML = html`
        <header class="pagina-topo">
          <div><h1>Painel</h1><p>Cobertura fotográfica das ordens de tratamento de sementes</p></div>
          <div class="pagina-acoes">
            <span class="texto-menor" id="painel-atualizado"></span>
            <button type="button" class="btn btn-secundario" data-acao="atualizar">${icone('atualizar', 18)}<span>Atualizar</span></button>
          </div>
        </header>
        <div id="painel-corpo" class="pilha"><p class="texto-menor">Carregando…</p></div>`;
      const corpo = el.querySelector('#painel-corpo');

      function carregar() {
        return Promise.all([TSI.ordens.visao(), TSI.maquinas.listar()]).then((r) => {
          if (!montado) return;
          visao = r[0]; maquinas = r[1];
          el.querySelector('#painel-atualizado').textContent = 'Atualizado às ' + util.fmtHora();
          desenhar();
        }).catch(ui.erro);
      }

      let assinaturaFiltros = null;
      function desenhar(forcar) {
        // só redesenha os filtros quando as opções mudam; senão atualiza apenas indicadores e gráficos
        const assinatura = !visao.length ? 'vazio' : JSON.stringify([util.unicos(visao.map((i) => i.ordem.cultura || SEM_CULTURA)), util.unicos(visao.map((i) => i.ordem.cultivar)),
          maquinas.map((m) => [m.id, m.nome, m.ativa]), util.unicos(visao.map((i) => (i.registro ? i.registro.operadorId + i.registro.operadorNome : '')))]);
        if (!forcar && assinatura === assinaturaFiltros && corpo.querySelector('#painel-resultado')) { desenharResultado(); return; }
        assinaturaFiltros = assinatura;
        if (!visao.length) {
          corpo.innerHTML = ui.vazio('planilha', 'Nenhuma ordem importada',
            'Importe a planilha RQ70 para alimentar o painel e liberar as ordens para os operadores.',
            html`<button type="button" class="btn btn-primario" data-acao="ir-importacao">${icone('upload', 18)}<span>Importar planilha RQ70</span></button>`);
          return;
        }
        const culturas = util.unicos(visao.map((i) => i.ordem.cultura || SEM_CULTURA));
        const cultivares = util.unicos(visao.map((i) => i.ordem.cultivar));
        const operadores = new Map();
        visao.forEach((i) => { if (i.registro) operadores.set(i.registro.operadorId, i.registro.operadorNome); });
        const opOperadores = Array.from(operadores, (p) => ({ valor: p[0], rotulo: p[1] })).sort((a, b) => util.compararNatural(a.rotulo, b.rotulo));

        corpo.innerHTML = html`
          <section class="filtros" aria-label="Filtros do painel">
            <div class="campo"><label for="painel-periodo">Período da solicitação</label>
              <select id="painel-periodo">${ui.opcoes([{ valor: 'tudo', rotulo: 'Todo o período' }, { valor: '7', rotulo: 'Últimos 7 dias' }, { valor: '30', rotulo: 'Últimos 30 dias' },
                { valor: '90', rotulo: 'Últimos 90 dias' }, { valor: 'mes', rotulo: 'Este mês' }, { valor: 'personalizado', rotulo: 'Personalizado' }], F.periodo)}</select></div>
            <div class="campo" data-personalizado ${F.periodo === 'personalizado' ? '' : ui.bruto('hidden')}><label for="painel-de">De</label><input type="date" id="painel-de" value="${F.de}"></div>
            <div class="campo" data-personalizado ${F.periodo === 'personalizado' ? '' : ui.bruto('hidden')}><label for="painel-ate">Até</label><input type="date" id="painel-ate" value="${F.ate}"></div>
            <div class="campo"><label for="painel-situacao">Situação</label>
              <select id="painel-situacao">${ui.opcoes(Object.keys(cfg.ROTULO_SITUACAO_ORDEM).map((k) => ({ valor: k, rotulo: cfg.ROTULO_SITUACAO_ORDEM[k] })), F.situacao, 'Todas')}</select></div>
            <div class="campo"><label for="painel-cultura">Cultura</label><select id="painel-cultura">${ui.opcoes(culturas, F.cultura, 'Todas')}</select></div>
            <div class="campo"><label for="painel-cultivar">Cultivar</label><select id="painel-cultivar">${ui.opcoes(cultivares, F.cultivar, 'Todas')}</select></div>
            <div class="campo"><label for="painel-maquina">Máquina</label>
              <select id="painel-maquina">${ui.opcoes(maquinas.map((m) => ({ valor: m.id, rotulo: m.nome + (m.ativa ? '' : ' (inativa)') })), F.maquina, 'Todas')}</select></div>
            <div class="campo"><label for="painel-operador">Operador</label><select id="painel-operador">${ui.opcoes(opOperadores, F.operador, 'Todos')}</select></div>
            <div class="campo"><label for="painel-lote">Lote</label><input type="search" id="painel-lote" value="${F.lote}" placeholder="Contém…" autocomplete="off"></div>
            <div class="campo"><label for="painel-ordem">Ordem de TSI</label><input type="search" id="painel-ordem" inputmode="numeric" value="${F.ordem}" placeholder="Número" autocomplete="off"></div>
            <div class="campo"><label for="painel-temOrdem">Ordem de TSI informada</label>
              <select id="painel-temOrdem">${ui.opcoes([{ valor: 'sim', rotulo: 'Com ordem' }, { valor: 'nao', rotulo: 'Sem ordem de TSI' }], F.temOrdem, 'Todos os lotes')}</select></div>
            <button type="button" class="btn btn-fantasma" data-acao="limpar-filtros">Limpar filtros</button>
          </section>
          <div id="painel-resultado" class="pilha"></div>`;
        desenharResultado();
      }

      function desenharResultado() {
        const alvo = corpo.querySelector('#painel-resultado');
        if (!alvo) return;
        const itens = filtrar(visao), ind = TSI.ordens.indicadores(itens);
        const inativas = ind.canceladas + ind.desconsideradas;
        alvo.innerHTML = html`
          <section class="indicadores" aria-label="Indicadores">
            <article class="indicador indicador-destaque">
              <span class="indicador-rotulo">Cobertura fotográfica</span>
              <strong class="indicador-valor" id="kpi-cobertura">${ind.cobertura === null ? '—' : util.fmtPct(ind.cobertura)}</strong>
              <div class="medidor" role="img" aria-label="${ind.cobertura === null ? 'Sem lotes elegíveis' : 'Cobertura de ' + util.fmtPct(ind.cobertura)}"><span style="--p:${ind.cobertura === null ? 0 : (ind.cobertura / 100).toFixed(4)}"></span></div>
              <span class="indicador-nota">${util.fmtNum(ind.registradas, 0)} de ${util.plural(ind.elegiveis, 'lote elegível', 'lotes elegíveis')}</span>
            </article>
            <article class="indicador">
              <span class="indicador-rotulo">Lotes importados</span>
              <strong class="indicador-valor" id="kpi-importadas">${util.fmtNum(ind.importadas, 0)}</strong>
              <span class="indicador-nota">${itens.length === visao.length ? 'na base do RQ70' : 'no filtro · ' + util.fmtNum(visao.length, 0) + ' na base'}${ind.semOrdem ? ' · ' + util.fmtNum(ind.semOrdem, 0) + ' sem ordem de TSI' : ''}</span>
            </article>
            <article class="indicador">
              <span class="indicador-rotulo">Registradas</span>
              <strong class="indicador-valor" id="kpi-registradas">${util.fmtNum(ind.registradas, 0)}</strong>
              <span class="indicador-nota">com relatório fotográfico</span>
            </article>
            <article class="indicador">
              <span class="indicador-rotulo">Pendentes</span>
              <strong class="indicador-valor" id="kpi-pendentes">${util.fmtNum(ind.pendentes, 0)}</strong>
              <a class="indicador-nota" href="#ordens" data-acao="ver-pendentes">Ver lotes pendentes</a>
            </article>
            <article class="indicador">
              <span class="indicador-rotulo">Canceladas ou desconsideradas</span>
              <strong class="indicador-valor" id="kpi-inativas">${util.fmtNum(inativas, 0)}</strong>
              <span class="indicador-nota">${util.fmtNum(ind.canceladas, 0)} canceladas · ${util.fmtNum(ind.desconsideradas, 0)} desconsideradas · fora da cobertura</span>
            </article>
          </section>
          <section class="graficos" aria-label="Gráficos de registros">
            ${cartaoGrafico('periodo', 'Registros por período', 'grande')}
            ${cartaoGrafico('maquina', 'Registros por máquina')}
            ${cartaoGrafico('cultura', 'Registros por cultura')}
            ${cartaoGrafico('operador', 'Registros por operador')}
          </section>`;
        desenharGraficos(itens);
      }

      function cartaoGrafico(id, titulo, classe) {
        return html`
          <article class="cartao grafico ${classe ? 'grafico-' + classe : ''}">
            <header>
              <div><h2>${titulo}</h2><p class="texto-menor" id="grafico-nota-${id}"></p></div>
              <button type="button" class="btn-icone" data-acao="alternar-tabela" data-grafico="${id}" aria-pressed="${emTabela[id]}"
                aria-label="${emTabela[id] ? 'Ver como gráfico' : 'Ver como tabela'}" title="${emTabela[id] ? 'Ver como gráfico' : 'Ver como tabela'}">${icone(emTabela[id] ? 'grafico' : 'tabela', 20)}</button>
            </header>
            <div class="grafico-area" id="grafico-${id}"></div>
          </article>`;
      }

      function desenharGraficos(itens) {
        const regs = itens.filter((i) => i.registro);
        const nomeMaquina = {};
        maquinas.forEach((m) => { nomeMaquina[m.id] = m.nome; });
        const series = {
          periodo: seriePorPeriodo(regs.map((i) => i.registro)),
          maquina: { dados: contar(regs, (i) => i.registro.maquinaId, (i) => nomeMaquina[i.registro.maquinaId] || i.registro.maquinaNome) },
          cultura: { dados: contar(regs, (i) => i.ordem.cultura || SEM_CULTURA, (i) => i.ordem.cultura || SEM_CULTURA) },
          operador: { dados: contar(regs, (i) => i.registro.operadorId, (i) => i.registro.operadorNome) }
        };
        const nota = (id, texto) => { const n = corpo.querySelector('#grafico-nota-' + id); if (n) n.textContent = texto; };
        nota('periodo', regs.length ? 'Por ' + series.periodo.unidade + ', pela data do registro · ' + util.plural(regs.length, 'registro', 'registros') : 'Pela data do registro');
        nota('maquina', util.plural(series.maquina.dados.length, 'máquina com registro', 'máquinas com registros'));
        nota('cultura', 'Cultura informada na importação do RQ70');
        nota('operador', util.plural(series.operador.dados.length, 'operador com registro', 'operadores com registros'));

        ['periodo', 'maquina', 'cultura', 'operador'].forEach((id) => {
          const alvo = corpo.querySelector('#grafico-' + id);
          if (!alvo) return;
          const dados = series[id].dados;
          if (emTabela[id]) {
            const ordenados = id === 'periodo' ? dados : dados.slice().sort((a, b) => b.valor - a.valor);
            ui.graficoTabela(alvo, ordenados, [id === 'periodo' ? 'Período' : id === 'maquina' ? 'Máquina' : id === 'cultura' ? 'Cultura' : 'Operador', 'Registros']);
          } else if (id === 'periodo') ui.graficoColunas(alvo, dados, { descricao: 'Registros por ' + series.periodo.unidade });
          else ui.graficoBarras(alvo, dados);
        });
      }

      const aoRedimensionar = util.debounce(() => { if (montado && visao.length) desenharResultado(); }, 200);

      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const acao = b.dataset.acao;
        if (acao === 'atualizar') ui.ocupar(b, () => (TSI.nuvem && TSI.nuvem.ativa ? TSI.nuvem.sincronia.puxar() : Promise.resolve()).then(carregar));
        else if (acao === 'ir-importacao') ctx.navegar('importacao');
        else if (acao === 'ver-pendentes') { ev.preventDefault(); ctx.navegar('ordens', { situacao: SIT.PENDENTE }); }
        else if (acao === 'limpar-filtros') {
          Object.assign(F, { periodo: 'tudo', de: '', ate: '', situacao: '', cultura: '', cultivar: '', maquina: '', operador: '', lote: '', ordem: '', temOrdem: '' });
          desenhar(true);
        } else if (acao === 'alternar-tabela') {
          emTabela[b.dataset.grafico] = !emTabela[b.dataset.grafico];
          ui.esconderDica();
          desenharResultado();
        }
      });
      const aoFiltrar = (ev) => {
        const id = ev.target.id || '';
        if (id.indexOf('painel-') !== 0) return;
        const campo = id.replace('painel-', '');
        if (!(campo in F)) return;
        F[campo] = ev.target.value;
        if (campo === 'periodo') el.querySelectorAll('[data-personalizado]').forEach((d) => { d.hidden = F.periodo !== 'personalizado'; });
        desenharResultado();
      };
      el.addEventListener('change', (ev) => { if (ev.target.type !== 'search') aoFiltrar(ev); });
      el.addEventListener('input', util.debounce((ev) => { if (ev.target.type === 'search') aoFiltrar(ev); }, 250));
      global.addEventListener('resize', aoRedimensionar);
      const desligar = [TSI.eventos.ouvir('registros:alterado', carregar), TSI.eventos.ouvir('ordens:alterado', carregar)];

      carregar();
      return function desmontar() {
        montado = false;
        global.removeEventListener('resize', aoRedimensionar);
        desligar.forEach((f) => f());
      };
    }
  };
})(window);
