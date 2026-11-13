/* ==========================================================================
   Histórico de alterações (auditoria): quem alterou, quando, o quê,
   valor anterior, novo valor e motivo
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, util } = TSI;
  const { html } = ui;

  const F = { busca: '', entidade: '', acao: '', de: '', ate: '' };
  let pagina = 1;

  TSI.telas.adm.historico = {
    montar(el) {
      let eventos = [], montado = true;
      const H = TSI.historico;
      const opcoesDe = (mapa) => Object.keys(mapa).map((k) => ({ valor: k, rotulo: mapa[k] }));

      el.innerHTML = html`
        <header class="pagina-topo">
          <div><h1>Histórico de alterações</h1><p>Trilha de auditoria: nenhuma alteração é feita sem deixar registro</p></div>
        </header>
        <section class="filtros" aria-label="Filtros do histórico">
          <div class="campo campo-largo"><label for="historico-busca">Pesquisar</label>
            <input type="search" id="historico-busca" value="${F.busca}" placeholder="Ordem, usuário, campo, valor ou motivo" autocomplete="off"></div>
          <div class="campo"><label for="historico-entidade">Item</label><select id="historico-entidade">${ui.opcoes(opcoesDe(H.ROTULO_ENTIDADE), F.entidade, 'Todos')}</select></div>
          <div class="campo"><label for="historico-acao">Ação</label><select id="historico-acao">${ui.opcoes(opcoesDe(H.ROTULO_ACAO), F.acao, 'Todas')}</select></div>
          <div class="campo"><label for="historico-de">De</label><input type="date" id="historico-de" value="${F.de}"></div>
          <div class="campo"><label for="historico-ate">Até</label><input type="date" id="historico-ate" value="${F.ate}"></div>
        </section>
        <div id="historico-lista"><p class="texto-menor">Carregando…</p></div>`;

      function carregar() {
        return H.listar().then((l) => { if (!montado) return; eventos = l; desenhar(); }).catch(ui.erro);
      }

      function desenhar() {
        const alvo = el.querySelector('#historico-lista');
        const lista = eventos.filter((e) => {
          if (F.entidade && e.entidade !== F.entidade) return false;
          if (F.acao && e.acao !== F.acao) return false;
          const dia = util.dataLocal(new Date(e.dataHora));
          if (F.de && dia < F.de) return false;
          if (F.ate && dia > F.ate) return false;
          if (F.busca && !util.contem([e.rotulo, e.usuarioNome, e.campo, e.valorAnterior, e.valorNovo, e.motivo].join(' '), F.busca)) return false;
          return true;
        });
        if (!eventos.length) { alvo.innerHTML = ui.vazio('historico', 'Nenhuma alteração registrada', 'Importações, registros, correções, cancelamentos e mudanças de cadastro aparecem aqui.'); return; }
        if (!lista.length) { alvo.innerHTML = ui.vazio('filtro', 'Nenhum evento encontrado', 'Ajuste os filtros para ver outros eventos.'); return; }
        const pg = ui.paginar(lista, pagina);
        pagina = pg.pagina;
        alvo.innerHTML = html`
          <div class="cartao cartao-tabela">
            <div class="tabela-rolagem">
              <table class="tabela tabela-compacta">
                <thead><tr><th>Data e horário</th><th>Responsável</th><th>Item</th><th>Ação</th><th>Campo</th><th>Valor anterior</th><th>Novo valor</th><th>Motivo</th></tr></thead>
                <tbody>${pg.itens.map((e) => html`
                  <tr>
                    <td class="nowrap">${util.fmtDataHora(e.dataHora, true)}</td>
                    <td>${e.usuarioNome}</td>
                    <td>${e.rotulo || (H.ROTULO_ENTIDADE[e.entidade] || e.entidade)}</td>
                    <td>${H.ROTULO_ACAO[e.acao] || e.acao}</td>
                    <td>${e.campo || '—'}</td>
                    <td>${e.valorAnterior === null ? '—' : e.valorAnterior}</td>
                    <td>${e.valorNovo === null ? '—' : e.valorNovo}</td>
                    <td>${e.motivo || '—'}</td>
                  </tr>`)}</tbody>
              </table>
            </div>
            ${ui.paginacao(pg, 'eventos')}
          </div>`;
      }

      const aoFiltrar = (ev) => {
        const id = ev.target.id || '';
        if (id.indexOf('historico-') !== 0) return;
        const campo = id.replace('historico-', '');
        if (!(campo in F)) return;
        F[campo] = ev.target.value;
        pagina = 1;
        desenhar();
      };
      el.addEventListener('change', (ev) => { if (ev.target.type !== 'search') aoFiltrar(ev); });
      el.addEventListener('input', util.debounce((ev) => { if (ev.target.type === 'search') aoFiltrar(ev); }, 250));
      el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-acao=pagina]'); if (b) { pagina = Number(b.dataset.pagina); desenhar(); } });
      const desligar = ['registros:alterado', 'ordens:alterado', 'usuarios:alterado', 'maquinas:alterado'].map((n) => TSI.eventos.ouvir(n, carregar));

      carregar();
      return function desmontar() { montado = false; desligar.forEach((f) => f()); };
    }
  };
})(window);
