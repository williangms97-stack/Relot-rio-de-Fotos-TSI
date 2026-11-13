/* ==========================================================================
   Ordens de tratamento: registradas, pendentes, canceladas e desconsideradas
   Cancelar/desconsiderar é exclusivo do ADM, exige motivo e pode ser revertido;
   tudo fica no histórico.
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, util, config: cfg } = TSI;
  const { html, icone } = ui;
  const SIT = cfg.SITUACAO_ORDEM;
  const SEM_CULTURA = 'Não informada';

  const F = { aba: '', busca: '', de: '', ate: '', cultura: '', cultivar: '' };
  let pagina = 1;

  TSI.telas.adm.ordens = {
    montar(el, ctx) {
      let visao = [], montado = true;
      const selecao = new Set();
      if (ctx.parametros && ctx.parametros.situacao !== undefined) { F.aba = ctx.parametros.situacao; pagina = 1; }

      el.innerHTML = html`
        <header class="pagina-topo">
          <div><h1>Ordens de tratamento</h1><p>Ordens importadas do RQ70 comparadas com os registros fotográficos</p></div>
          <div class="pagina-acoes"><button type="button" class="btn btn-secundario" data-acao="ir-importacao">${icone('upload', 18)}<span>Importar RQ70</span></button></div>
        </header>
        <div id="ordens-corpo" class="pilha"><p class="texto-menor">Carregando…</p></div>`;
      const corpo = el.querySelector('#ordens-corpo');

      function carregar() {
        return TSI.ordens.visao().then((v) => {
          if (!montado) return;
          visao = v;
          Array.from(selecao).forEach((n) => { if (!visao.some((i) => i.ordem.ordemTsi === n)) selecao.delete(n); });
          desenhar();
        }).catch(ui.erro);
      }

      function semAba() {
        return visao.filter((i) => {
          const o = i.ordem;
          if (F.de && (!o.data || o.data < F.de)) return false;
          if (F.ate && (!o.data || o.data > F.ate)) return false;
          if (F.cultura && (o.cultura || SEM_CULTURA) !== F.cultura) return false;
          if (F.cultivar && o.cultivar !== F.cultivar) return false;
          if (F.busca && !util.contem([o.ordemTsi, o.lote, o.cultivar, o.tratamento].join(' '), F.busca)) return false;
          return true;
        });
      }
      const filtrados = () => semAba().filter((i) => !F.aba || i.situacao === F.aba);

      function desenhar() {
        if (!visao.length) {
          corpo.innerHTML = ui.vazio('ordens', 'Nenhuma ordem importada', 'As ordens de tratamento vêm da planilha RQ70.',
            html`<button type="button" class="btn btn-primario" data-acao="ir-importacao">${icone('upload', 18)}<span>Importar planilha RQ70</span></button>`);
          return;
        }
        corpo.innerHTML = html`
          <div class="abas" role="tablist" aria-label="Situação das ordens" id="ordens-abas"></div>
          <section class="filtros" aria-label="Filtros das ordens">
            <div class="campo campo-largo"><label for="ordens-busca">Pesquisar</label>
              <input type="search" id="ordens-busca" value="${F.busca}" placeholder="Ordem, lote, cultivar ou tratamento" autocomplete="off"></div>
            <div class="campo"><label for="ordens-de">Solicitada de</label><input type="date" id="ordens-de" value="${F.de}"></div>
            <div class="campo"><label for="ordens-ate">até</label><input type="date" id="ordens-ate" value="${F.ate}"></div>
            <div class="campo"><label for="ordens-cultura">Cultura</label>
              <select id="ordens-cultura">${ui.opcoes(util.unicos(visao.map((i) => i.ordem.cultura || SEM_CULTURA)), F.cultura, 'Todas')}</select></div>
            <div class="campo"><label for="ordens-cultivar">Cultivar</label>
              <select id="ordens-cultivar">${ui.opcoes(util.unicos(visao.map((i) => i.ordem.cultivar)), F.cultivar, 'Todas')}</select></div>
            <button type="button" class="btn btn-fantasma" data-acao="limpar-filtros">Limpar filtros</button>
          </section>
          <div class="barra-selecao" id="ordens-selecao" hidden></div>
          <div id="ordens-lista"></div>`;
        desenharLista();
      }

      function desenharLista() {
        const base = semAba(), ind = TSI.ordens.indicadores(base), lista = filtrados();
        const abas = [['', 'Todas', ind.importadas], [SIT.PENDENTE, 'Pendentes', ind.pendentes], [SIT.REGISTRADA, 'Registradas', ind.registradas],
          [SIT.CANCELADA, 'Canceladas', ind.canceladas], [SIT.DESCONSIDERADA, 'Desconsideradas', ind.desconsideradas]];
        corpo.querySelector('#ordens-abas').innerHTML = html`${abas.map((a) => html`
          <button type="button" role="tab" aria-selected="${F.aba === a[0]}" class="${F.aba === a[0] ? 'ativa' : ''}" data-acao="aba" data-aba="${a[0]}">${a[1]}<span>${util.fmtNum(a[2], 0)}</span></button>`)}`;

        const alvo = corpo.querySelector('#ordens-lista');
        if (!lista.length) {
          alvo.innerHTML = ui.vazio('filtro', 'Nenhuma ordem encontrada', 'Ajuste a situação ou os filtros para ver outras ordens.');
          desenharSelecao(lista);
          return;
        }
        const pg = ui.paginar(lista, pagina);
        pagina = pg.pagina;
        const todasDaPagina = pg.itens.every((i) => selecao.has(i.ordem.ordemTsi));
        alvo.innerHTML = html`
          <div class="cartao cartao-tabela">
            <div class="tabela-rolagem">
              <table class="tabela">
                <thead><tr>
                  <th class="col-marca"><input type="checkbox" id="ordens-marcar-pagina" aria-label="Selecionar as ordens desta página" ${todasDaPagina ? ui.bruto('checked') : ''}></th>
                  <th>Ordem de TSI</th><th>Solicitação</th><th>Lote</th><th>Cultivar</th><th>Tratamento</th><th>Embalagem</th><th class="num">Qtd. prevista</th><th>Situação</th>
                </tr></thead>
                <tbody>
                  ${pg.itens.map((i) => { const o = i.ordem; return html`
                    <tr class="linha-clicavel" data-ordem="${o.ordemTsi}" tabindex="0" aria-label="Abrir ordem ${o.ordemTsi}">
                      <td class="col-marca"><input type="checkbox" id="ordens-marcar-${o.ordemTsi}" data-marcar="${o.ordemTsi}" aria-label="Selecionar ordem ${o.ordemTsi}" ${selecao.has(o.ordemTsi) ? ui.bruto('checked') : ''}></td>
                      <td><strong>${o.ordemTsi}</strong></td>
                      <td class="nowrap">${TSI.ordens.fmtCampo(o, 'data')}</td>
                      <td>${o.lote || '—'}</td>
                      <td>${o.cultivar || '—'}</td>
                      <td>${o.tratamento || '—'}</td>
                      <td>${TSI.ordens.ROTULO_CLASSE[o.classeEmbalagem] || '—'}</td>
                      <td class="num">${TSI.ordens.fmtCampo(o, 'qtdTsi')}</td>
                      <td>${ui.seloOrdem(i.situacao)}</td>
                    </tr>`; })}
                </tbody>
              </table>
            </div>
            ${ui.paginacao(pg, 'ordens')}
          </div>`;
        desenharSelecao(lista);
      }

      function desenharSelecao(lista) {
        const barra = corpo.querySelector('#ordens-selecao');
        if (!barra) return;
        barra.hidden = selecao.size === 0;
        if (!selecao.size) { barra.innerHTML = ''; return; }
        const faltam = lista.filter((i) => !selecao.has(i.ordem.ordemTsi)).length;
        barra.innerHTML = html`
          <strong>${util.plural(selecao.size, 'ordem selecionada', 'ordens selecionadas')}</strong>
          ${faltam ? html`<button type="button" class="btn btn-fantasma btn-p" data-acao="marcar-filtro">Selecionar todas as ${util.fmtNum(lista.length, 0)} do filtro</button>` : ''}
          <span class="barra-selecao-acoes">
            <button type="button" class="btn btn-secundario btn-p" data-acao="lote-desconsiderar">${icone('anular', 16)}<span>Desconsiderar</span></button>
            <button type="button" class="btn btn-secundario btn-p" data-acao="lote-cancelar">${icone('x', 16)}<span>Cancelar ordens</span></button>
            <button type="button" class="btn btn-secundario btn-p" data-acao="lote-reverter">${icone('desfazer', 16)}<span>Reverter para pendente</span></button>
            <button type="button" class="btn btn-fantasma btn-p" data-acao="limpar-selecao">Limpar seleção</button>
          </span>`;
      }

      /* ---------- Ações ---------- */
      function inativar(numeros, tipo, aoConcluir) {
        const verbo = tipo === SIT.CANCELADA ? 'Cancelar' : 'Desconsiderar';
        const um = numeros.length === 1;
        ui.confirmar({
          titulo: verbo + (um ? ' a ordem ' + numeros[0] + '?' : ' ' + util.fmtNum(numeros.length, 0) + ' ordens?'),
          mensagem: tipo === SIT.CANCELADA
            ? 'Use o cancelamento quando o tratamento não será realizado. A ordem sai da cobertura fotográfica e deixa de aceitar registro.'
            : 'Use quando a ordem não deve ser cobrada por fotografia (por exemplo, tratada antes da implantação do sistema). Ela sai da cobertura fotográfica.',
          detalhe: um ? '' : 'Ordens que já possuem registro fotográfico serão ignoradas.',
          rotuloConfirmar: verbo, perigo: true, motivo: { rotulo: 'Motivo', obrigatorio: true }
        }).then((resp) => {
          if (!resp) return;
          return TSI.ordens.inativar(numeros, tipo, resp.motivo).then((r) => {
            const feito = tipo === SIT.CANCELADA ? ['ordem cancelada', 'ordens canceladas'] : ['ordem desconsiderada', 'ordens desconsideradas'];
            ui.aviso(util.plural(r.aplicadas, feito[0], feito[1]) + (r.ignoradas.length ? ' · ' + util.plural(r.ignoradas.length, 'ignorada', 'ignoradas') + ' (' + r.ignoradas[0].motivo + ')' : '') + '.',
              r.aplicadas ? 'ok' : 'alerta');
            selecao.clear();
            if (aoConcluir) aoConcluir();
            return carregar();
          });
        }).catch(ui.erro);
      }
      function reverter(numeros, aoConcluir) {
        const alvo = numeros.filter((n) => visao.some((i) => i.ordem.ordemTsi === n && i.inativacao));
        if (!alvo.length) { ui.aviso('Nenhuma das ordens selecionadas está cancelada ou desconsiderada.', 'alerta'); return; }
        ui.confirmar({
          titulo: alvo.length === 1 ? 'Reverter a ordem ' + alvo[0] + ' para pendente?' : 'Reverter ' + util.fmtNum(alvo.length, 0) + ' ordens para pendente?',
          mensagem: 'A ordem volta a contar na cobertura fotográfica e a aceitar registro. O cancelamento anterior continua no histórico.',
          rotuloConfirmar: 'Reverter', motivo: { rotulo: 'Motivo da reversão', obrigatorio: false }
        }).then((resp) => {
          if (!resp) return;
          return TSI.ordens.reverter(alvo, resp.motivo).then((r) => {
            ui.aviso(util.plural(r.aplicadas, 'ordem voltou a ficar pendente', 'ordens voltaram a ficar pendentes') + '.', 'ok');
            selecao.clear();
            if (aoConcluir) aoConcluir();
            return carregar();
          });
        }).catch(ui.erro);
      }

      /** Janela com todos os dados do RQ70, a situação, o registro e o histórico da ordem. */
      function abrirOrdem(numero) {
        const item = visao.filter((i) => i.ordem.ordemTsi === numero)[0];
        if (!item) return;
        const o = item.ordem, f = (c) => TSI.ordens.fmtCampo(o, c), reg = item.registro, inat = item.inativacao;
        const acoes = [];
        if (item.situacao === SIT.PENDENTE) {
          acoes.push({ rotulo: 'Desconsiderar', classe: 'btn-secundario', icone: 'anular', acao: (m) => inativar([numero], SIT.DESCONSIDERADA, () => m.fechar()) });
          acoes.push({ rotulo: 'Cancelar ordem', classe: 'btn-perigo-suave', icone: 'x', acao: (m) => inativar([numero], SIT.CANCELADA, () => m.fechar()) });
        } else if (inat) {
          acoes.push({ rotulo: 'Reverter para pendente', classe: 'btn-primario', icone: 'desfazer', acao: (m) => reverter([numero], () => m.fechar()) });
        } else if (reg) {
          acoes.push({ rotulo: 'Abrir registro fotográfico', classe: 'btn-primario', icone: 'camera', acao: (m) => { m.fechar(); TSI.telas.adm.abrirRegistro(reg.id); } });
        }
        const m = ui.modal({
          titulo: 'Ordem de TSI ' + numero, largura: 'g', acoes: acoes,
          conteudo: html`
            <div class="ordem-detalhe">
              <div class="ordem-detalhe-topo">${ui.seloOrdem(item.situacao)}<span class="texto-menor">${o.cultura ? 'Cultura: ' + o.cultura : 'Cultura não informada na importação'}</span></div>
              ${inat ? html`<div class="alerta alerta-neutro">${icone('anular', 20)}<div>
                <strong>${cfg.ROTULO_SITUACAO_ORDEM[inat.situacao]} por ${inat.usuarioNome} em ${util.fmtDataHora(inat.dataHora)}</strong><p>Motivo: ${inat.motivo}</p></div></div>` : ''}
              ${reg ? html`<div class="alerta alerta-ok">${icone('checkCirculo', 20)}<div>
                <strong>Registrada por ${reg.operadorNome} em ${util.fmtDataHora(reg.criadoEm)}</strong>
                <p>${reg.maquinaNome} · tratado: ${TSI.ordens.fmtQtd(reg.qtdEfetiva, reg.ordem)} · protocolo ${reg.protocolo}</p></div></div>` : ''}
              <h3 class="secao-titulo">Dados da solicitação (RQ70)</h3>
              ${ui.dados([
                ['Data da solicitação', f('data')], ['Armazém', f('armazem')], ['Local de produção', f('localProducao')],
                ['Cultivar', f('cultivar')], ['Lote', f('lote')], ['Categoria', f('categoria')],
                ['Peneira (mm)', f('peneira')], ['Peso do lote (kg)', f('pesoLote')], ['Peso por embalagem original (kg)', f('pesoEmbOriginal')],
                ['Embalagens inteiras (unid.)', f('qtdEmbInteiras')], ['Embalagens por pallet', f('qtdEmbPallet')], ['Embalagem fracionada (kg)', f('embFracionada')],
                ['Embalagem original', f('embalagemOriginal')], ['Tipo de embalagem solicitada', f('tipoEmbalagem')], ['Tratamento', f('tratamento')]
              ], 'dados-3col')}
              <div class="ordem-blocos">
                <div><h3 class="secao-titulo">TSI</h3>${ui.dados([['Ordem de TSI', o.ordemTsi], ['Quantidade solicitada (unid.)', f('qtdTsi')], ['Peso por embalagem (kg)', f('pesoEmbTsi')]])}</div>
                <div><h3 class="secao-titulo">Reembalagem</h3>${ui.dados([['Ordem de reembalagem', f('ordemReembalagem')], ['Quantidade solicitada (unid.)', f('qtdReembalagem')], ['Peso por embalagem (kg)', f('pesoEmbReembalagem')]])}</div>
              </div>
              ${ui.dados([{ rotulo: 'Observações', valor: f('observacoes'), largo: true }])}
              <p class="texto-menor">Importada em ${util.fmtDataHora(o.criadoEm)}${o.atualizadoEm !== o.criadoEm ? ' · atualizada pela planilha em ' + util.fmtDataHora(o.atualizadoEm) : ''} · linha ${o.linhaPlanilha} da planilha</p>
              <h3 class="secao-titulo">Histórico da ordem</h3>
              <div id="ordem-historico"><p class="texto-menor">Carregando…</p></div>
            </div>`
        });
        TSI.historico.daEntidade('ordem', numero).then((evs) => {
          const alvo = m.corpo.querySelector('#ordem-historico');
          if (alvo) alvo.innerHTML = TSI.telas.adm.eventosHtml(evs);
        }).catch(ui.erro);
      }

      /* ---------- Eventos ---------- */
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('input[type=checkbox]') || ev.target.closest('.col-marca')) return;
        const b = ev.target.closest('[data-acao]');
        if (b) {
          const acao = b.dataset.acao, nums = Array.from(selecao);
          if (acao === 'ir-importacao') ctx.navegar('importacao');
          else if (acao === 'aba') { F.aba = b.dataset.aba; pagina = 1; desenharLista(); }
          else if (acao === 'pagina') { pagina = Number(b.dataset.pagina); desenharLista(); }
          else if (acao === 'limpar-filtros') { Object.assign(F, { busca: '', de: '', ate: '', cultura: '', cultivar: '' }); pagina = 1; desenhar(); }
          else if (acao === 'marcar-filtro') { filtrados().forEach((i) => selecao.add(i.ordem.ordemTsi)); desenharLista(); }
          else if (acao === 'limpar-selecao') { selecao.clear(); desenharLista(); }
          else if (acao === 'lote-desconsiderar') inativar(nums, SIT.DESCONSIDERADA);
          else if (acao === 'lote-cancelar') inativar(nums, SIT.CANCELADA);
          else if (acao === 'lote-reverter') reverter(nums);
          return;
        }
        const linha = ev.target.closest('tr[data-ordem]');
        if (linha) abrirOrdem(linha.dataset.ordem);
      });
      el.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const linha = ev.target.closest('tr[data-ordem]');
        if (linha && ev.target === linha) { ev.preventDefault(); abrirOrdem(linha.dataset.ordem); }
      });
      el.addEventListener('change', (ev) => {
        const t = ev.target;
        if (t.dataset.marcar) {
          if (t.checked) selecao.add(t.dataset.marcar); else selecao.delete(t.dataset.marcar);
          const lista = filtrados(), pg = ui.paginar(lista, pagina), cab = el.querySelector('#ordens-marcar-pagina');
          if (cab) cab.checked = pg.itens.every((i) => selecao.has(i.ordem.ordemTsi));
          desenharSelecao(lista);
          return;
        }
        if (t.id === 'ordens-marcar-pagina') {
          ui.paginar(filtrados(), pagina).itens.forEach((i) => { if (t.checked) selecao.add(i.ordem.ordemTsi); else selecao.delete(i.ordem.ordemTsi); });
          desenharLista();
          return;
        }
        if (t.type !== 'search') aoFiltrar(ev);
      });
      function aoFiltrar(ev) {
        const id = ev.target.id || '';
        if (id.indexOf('ordens-') !== 0) return;
        const campo = id.replace('ordens-', '');
        if (!(campo in F)) return;
        F[campo] = ev.target.value;
        pagina = 1;
        desenharLista();
      }
      el.addEventListener('input', util.debounce((ev) => { if (ev.target.type === 'search') aoFiltrar(ev); }, 250));
      const desligar = [TSI.eventos.ouvir('registros:alterado', carregar), TSI.eventos.ouvir('ordens:alterado', carregar)];

      carregar();
      return function desmontar() { montado = false; desligar.forEach((f) => f()); };
    }
  };
})(window);
