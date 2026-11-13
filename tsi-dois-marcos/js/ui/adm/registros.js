/* ==========================================================================
   Acompanhamento dos registros fotográficos (mais recentes primeiro)
   A lista se atualiza sozinha quando um registro é criado ou alterado — hoje,
   por eventos locais e entre abas; com servidor, pelos avisos remotos.
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, util, config: cfg } = TSI;
  const { html, icone } = ui;

  const F = { busca: '', maquina: '', operador: '', de: '', ate: '', envio: '', anulados: false };
  let pagina = 1;

  TSI.telas.adm.registros = {
    montar(el) {
      let registros = [], maquinas = [], montado = true;

      el.innerHTML = html`
        <header class="pagina-topo">
          <div><h1>Registros</h1><p>Registros fotográficos enviados pelos operadores, do mais recente ao mais antigo</p></div>
          <div class="pagina-acoes">
            <span class="texto-menor" id="registros-atualizado"></span>
            <button type="button" class="btn btn-secundario" data-acao="atualizar">${icone('atualizar', 18)}<span>Atualizar</span></button>
          </div>
        </header>
        <section class="filtros" aria-label="Filtros dos registros" id="registros-filtros"></section>
        <div id="registros-lista"><p class="texto-menor">Carregando…</p></div>`;

      function carregar() {
        return Promise.all([TSI.registros.listar(), TSI.maquinas.listar()]).then((r) => {
          if (!montado) return;
          registros = r[0]; maquinas = r[1];
          el.querySelector('#registros-atualizado').textContent = 'Atualizado às ' + util.fmtHora();
          desenharFiltros();
          desenharLista();
        }).catch(ui.erro);
      }

      let assinaturaFiltros = null;
      function desenharFiltros() {
        const operadores = new Map();
        registros.forEach((r) => operadores.set(r.operadorId, r.operadorNome));
        // só redesenha os filtros quando as opções mudam, para não tirar o foco de quem está digitando
        const assinatura = JSON.stringify([maquinas.map((m) => [m.id, m.nome]), Array.from(operadores)]);
        if (assinatura === assinaturaFiltros) return;
        assinaturaFiltros = assinatura;
        el.querySelector('#registros-filtros').innerHTML = html`
          <div class="campo campo-largo"><label for="registros-busca">Pesquisar</label>
            <input type="search" id="registros-busca" value="${F.busca}" placeholder="Ordem, lote, cultivar ou protocolo" autocomplete="off"></div>
          <div class="campo"><label for="registros-maquina">Máquina</label>
            <select id="registros-maquina">${ui.opcoes(maquinas.map((m) => ({ valor: m.id, rotulo: m.nome })), F.maquina, 'Todas')}</select></div>
          <div class="campo"><label for="registros-operador">Operador</label>
            <select id="registros-operador">${ui.opcoes(Array.from(operadores, (p) => ({ valor: p[0], rotulo: p[1] })), F.operador, 'Todos')}</select></div>
          <div class="campo"><label for="registros-de">Registrado de</label><input type="date" id="registros-de" value="${F.de}"></div>
          <div class="campo"><label for="registros-ate">até</label><input type="date" id="registros-ate" value="${F.ate}"></div>
          <div class="campo"><label for="registros-envio">Situação</label>
            <select id="registros-envio">${ui.opcoes(Object.keys(cfg.ROTULO_SITUACAO_ENVIO).map((k) => ({ valor: k, rotulo: cfg.ROTULO_SITUACAO_ENVIO[k] })), F.envio, 'Todas')}</select></div>
          <label class="marcador"><input type="checkbox" id="registros-anulados" ${F.anulados ? ui.bruto('checked') : ''}><span>Mostrar anulados</span></label>`;
      }

      function filtrados() {
        return registros.filter((r) => {
          const o = r.ordem || {};
          if (!F.anulados && r.anulado) return false;
          if (F.maquina && r.maquinaId !== F.maquina) return false;
          if (F.operador && r.operadorId !== F.operador) return false;
          if (F.envio && r.situacaoEnvio !== F.envio) return false;
          const dia = util.dataLocal(new Date(r.criadoEm));
          if (F.de && dia < F.de) return false;
          if (F.ate && dia > F.ate) return false;
          if (F.busca && !util.contem([r.ordemTsi, o.lote, o.cultivar, r.protocolo].join(' '), F.busca)) return false;
          return true;
        });
      }

      function desenharLista() {
        const alvo = el.querySelector('#registros-lista');
        const lista = filtrados();
        if (!registros.length) {
          alvo.innerHTML = ui.vazio('camera', 'Nenhum registro fotográfico', 'Os registros aparecem aqui assim que os operadores enviam pelo aplicativo.');
          return;
        }
        if (!lista.length) { alvo.innerHTML = ui.vazio('filtro', 'Nenhum registro encontrado', 'Ajuste os filtros para ver outros registros.'); return; }
        const pg = ui.paginar(lista, pagina);
        pagina = pg.pagina;
        alvo.innerHTML = html`
          <div class="cartao cartao-tabela">
            <div class="tabela-rolagem">
              <table class="tabela">
                <thead><tr><th>Foto</th><th>Ordem</th><th>Lote</th><th>Cultivar</th><th>Máquina</th><th>Operador</th><th>Data e horário</th><th>Situação</th></tr></thead>
                <tbody>
                  ${pg.itens.map((r) => { const o = r.ordem || {}; return html`
                    <tr class="linha-clicavel ${r.anulado ? 'linha-apagada' : ''}" data-id="${r.id}" tabindex="0" aria-label="Abrir registro da ordem ${r.ordemTsi}">
                      <td class="col-foto">${r.miniatura ? html`<img src="${r.miniatura}" alt="Miniatura da fotografia da amostra" loading="lazy">` : ''}</td>
                      <td><strong>${r.ordemTsi}</strong></td>
                      <td>${o.lote || '—'}</td>
                      <td>${o.cultivar || '—'}</td>
                      <td>${r.maquinaNome}</td>
                      <td>${r.operadorNome}</td>
                      <td class="nowrap">${util.fmtDataHora(r.criadoEm)}</td>
                      <td><div class="selos">
                        ${r.anulado ? ui.seloSimples('Anulado', 'selo-cancelada', 'anular') : ui.seloEnvio(r.situacaoEnvio)}
                        ${r.divergencia ? ui.seloSimples('Divergência', 'selo-pendente', 'alerta') : ''}
                        ${r.corrigidoEm ? ui.seloSimples('Corrigido', 'selo-neutro', 'editar') : ''}
                      </div></td>
                    </tr>`; })}
                </tbody>
              </table>
            </div>
            ${ui.paginacao(pg, 'registros')}
          </div>`;
      }

      function abrir(linha) { TSI.telas.adm.abrirRegistro(linha.dataset.id); }

      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-acao]');
        if (b && b.dataset.acao === 'atualizar') { ui.ocupar(b, carregar); return; }
        if (b && b.dataset.acao === 'pagina') { pagina = Number(b.dataset.pagina); desenharLista(); return; }
        const linha = ev.target.closest('tr[data-id]');
        if (linha) abrir(linha);
      });
      el.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const linha = ev.target.closest('tr[data-id]');
        if (linha && ev.target === linha) { ev.preventDefault(); abrir(linha); }
      });
      const aoFiltrar = (ev) => {
        const id = ev.target.id || '';
        if (id.indexOf('registros-') !== 0) return;
        const campo = id.replace('registros-', '');
        if (!(campo in F)) return;
        F[campo] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
        pagina = 1;
        desenharLista();
      };
      el.addEventListener('change', (ev) => { if (ev.target.type !== 'search') aoFiltrar(ev); });
      el.addEventListener('input', util.debounce((ev) => { if (ev.target.type === 'search') aoFiltrar(ev); }, 250));
      const desligar = [TSI.eventos.ouvir('registros:alterado', carregar)];

      carregar();
      return function desmontar() { montado = false; desligar.forEach((f) => f()); };
    }
  };
})(window);
