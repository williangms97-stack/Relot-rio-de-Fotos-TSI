/* ==========================================================================
   Importação da planilha RQ70: envio, pré-visualização, confirmação e histórico
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, util, config: cfg } = TSI;
  const { html, icone } = ui;
  const ROT = () => TSI.importacao.ROTULO_SITUACAO;
  const CLASSE_SELO = { nova: 'selo-registrada', atualizada: 'selo-info', inalterada: 'selo-neutro', sem_tsi: 'selo-pendente', duplicada: 'selo-cancelada' };
  const seloLinha = (s) => ui.seloSimples(ROT()[s] || s, CLASSE_SELO[s]);

  /** Janela "Ver planilha": todas as linhas e colunas lidas em uma importação. */
  function abrirPlanilha(imp) {
    const m = ui.modal({ titulo: 'Planilha importada em ' + util.fmtDataHora(imp.dataHora), largura: 'xg', conteudo: html`<p class="texto-menor">Carregando…</p>` });
    TSI.importacao.linhasDa(imp.id).then((doc) => {
      if (!doc) { m.definirConteudo(html`<p>As linhas desta importação não estão disponíveis.</p>`); return; }
      const campos = doc.campos.map((c) => TSI.ordens.CAMPO[c]);
      const iData = doc.campos.indexOf('data');
      let busca = '', situacao = '', pagina = 1;
      const fmt = (l, i) => {
        const v = l.v[i];
        if (v === null || v === undefined || v === '') return i === iData && l.dataTexto ? l.dataTexto : '';
        if (i === iData) return util.fmtData(v);
        return typeof v === 'number' ? util.fmtNum(v, 2) : String(v);
      };
      m.definirConteudo(html`
        <p class="texto-menor">${imp.arquivoNome} · aba ${imp.aba} · cabeçalho na linha ${imp.linhaCabecalho} · importada por ${imp.usuarioNome}${imp.cultura ? ' · cultura: ' + imp.cultura : ''}</p>
        <section class="filtros">
          <div class="campo campo-largo"><label for="planilha-busca">Pesquisar nas linhas</label><input type="search" id="planilha-busca" placeholder="Qualquer valor da linha" autocomplete="off"></div>
          <div class="campo"><label for="planilha-situacao">Situação na importação</label>
            <select id="planilha-situacao">${ui.opcoes(Object.keys(ROT()).map((k) => ({ valor: k, rotulo: ROT()[k] })), '', 'Todas')}</select></div>
        </section>
        <div id="planilha-tabela"></div>`);
      function desenhar() {
        const lista = doc.linhas.filter((l) => (!situacao || l.situacao === situacao) && (!busca || util.contem(l.v.map((v, i) => fmt(l, i)).join(' '), busca)));
        const pg = ui.paginar(lista, pagina);
        pagina = pg.pagina;
        m.corpo.querySelector('#planilha-tabela').innerHTML = lista.length ? html`
          <div class="tabela-rolagem">
            <table class="tabela tabela-compacta">
              <thead><tr><th class="num">Linha</th><th>Situação</th>${campos.map((c) => html`<th class="${c.tipo === 'numero' ? 'num' : ''}">${c.curto}</th>`)}</tr></thead>
              <tbody>${pg.itens.map((l) => html`<tr><td class="num">${l.linha}</td><td>${seloLinha(l.situacao)}</td>
                ${campos.map((c, i) => html`<td class="${c.tipo === 'numero' ? 'num' : ''} ${c.campo === 'observacoes' ? '' : 'nowrap'}">${fmt(l, i)}</td>`)}</tr>`)}</tbody>
            </table>
          </div>
          ${ui.paginacao(pg, 'linhas')}` : ui.vazio('filtro', 'Nenhuma linha encontrada', 'Ajuste a pesquisa ou a situação.');
      }
      m.corpo.addEventListener('input', util.debounce((ev) => { if (ev.target.id === 'planilha-busca') { busca = ev.target.value; pagina = 1; desenhar(); } }, 250));
      m.corpo.addEventListener('change', (ev) => { if (ev.target.id === 'planilha-situacao') { situacao = ev.target.value; pagina = 1; desenhar(); } });
      m.corpo.addEventListener('click', (ev) => { const b = ev.target.closest('[data-acao=pagina]'); if (b) { pagina = Number(b.dataset.pagina); desenhar(); } });
      desenhar();
    }).catch(ui.erro);
  }

  TSI.telas.adm.importacao = {
    montar(el, ctx) {
      let leitura = null, analise = null, cultura = '', filtro = '', pagina = 1, importacoes = [], montado = true;

      el.innerHTML = html`
        <header class="pagina-topo">
          <div><h1>Importar RQ70</h1><p>Planilha de Solicitação de Reembalagem e Tratamento: a fonte das ordens de TSI</p></div>
        </header>
        <section class="cartao imp-envio" id="imp-envio">
          <div class="imp-solta" id="imp-solta">
            <span class="imp-solta-icone">${icone('upload', 30)}</span>
            <strong>Arraste a planilha RQ70 para esta área</strong>
            <button type="button" class="btn btn-primario" data-acao="escolher">${icone('planilha', 18)}<span>Selecionar planilha</span></button>
            <input type="file" id="imp-arquivo" class="so-leitor" tabindex="-1" aria-label="Arquivo da planilha RQ70"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel">
            <span class="texto-menor">Arquivos .xlsx ou .xls. As colunas são identificadas pelo cabeçalho e nada é gravado antes da sua confirmação.</span>
          </div>
          <div class="campo imp-cultura">
            <label for="imp-cultura">Cultura das ordens desta planilha <span class="opcional">(opcional)</span></label>
            <input type="text" id="imp-cultura" list="imp-culturas" maxlength="40" placeholder="Ex.: Soja" autocomplete="off">
            <datalist id="imp-culturas"></datalist>
            <p class="campo-ajuda">O RQ70 não tem coluna de cultura. O que for informado aqui alimenta o filtro e o gráfico “por cultura”; em branco, as ordens ficam como “Não informada”.</p>
          </div>
        </section>
        <div id="imp-previa"></div>
        <section class="imp-historico">
          <h2 class="secao-titulo">Histórico de importações</h2>
          <div id="imp-historico"><p class="texto-menor">Carregando…</p></div>
        </section>`;

      function carregarHistorico() {
        return Promise.all([TSI.importacao.listar(), TSI.repo.ordens.listar()]).then((r) => {
          if (!montado) return;
          importacoes = r[0];
          const culturas = util.unicos(r[1].map((o) => o.cultura).concat(cfg.IMPORTACAO.CULTURAS_SUGERIDAS));
          el.querySelector('#imp-culturas').innerHTML = html`${culturas.map((c) => html`<option value="${c}"></option>`)}`;
          const alvo = el.querySelector('#imp-historico');
          alvo.innerHTML = importacoes.length ? html`
            <div class="cartao cartao-tabela">
              <div class="tabela-rolagem">
                <table class="tabela">
                  <thead><tr><th>Data e horário</th><th>Responsável</th><th>Arquivo</th><th>Cultura</th><th class="num">Linhas lidas</th><th class="num">Novas</th>
                    <th class="num">Atualizadas</th><th class="num">Sem alteração</th><th class="num">Sem ordem de TSI</th><th class="num">Duplicadas</th><th></th></tr></thead>
                  <tbody>${importacoes.map((i) => html`
                    <tr><td class="nowrap">${util.fmtDataHora(i.dataHora)}</td><td>${i.usuarioNome}</td><td>${i.arquivoNome}</td><td>${i.cultura || '—'}</td>
                      <td class="num">${util.fmtNum(i.resumo.lidas, 0)}</td><td class="num">${util.fmtNum(i.resumo.novas, 0)}</td><td class="num">${util.fmtNum(i.resumo.atualizadas, 0)}</td>
                      <td class="num">${util.fmtNum(i.resumo.inalteradas, 0)}</td><td class="num">${util.fmtNum(i.resumo.semTsi, 0)}</td><td class="num">${util.fmtNum(i.resumo.duplicadas, 0)}</td>
                      <td><button type="button" class="btn btn-secundario btn-p" data-acao="ver-planilha" data-id="${i.id}">${icone('tabela', 16)}<span>Ver planilha</span></button></td></tr>`)}</tbody>
                </table>
              </div>
            </div>` : ui.vazio('planilha', 'Nenhuma planilha importada', 'Depois da primeira importação, cada envio fica registrado aqui com data, horário e responsável.');
        }).catch(ui.erro);
      }

      function processar(arquivo) {
        if (!arquivo) return;
        const fechar = ui.carregando('Lendo a planilha… Arquivos grandes podem levar alguns segundos.');
        util.proximoQuadro().then(() => TSI.importacao.ler(arquivo)).then((l) => {
          leitura = l;
          cultura = util.limpar(el.querySelector('#imp-cultura').value);
          return TSI.importacao.analisar(leitura, cultura);
        }).then((a) => {
          analise = a; filtro = ''; pagina = 1;
          fechar();
          desenharPrevia();
          el.querySelector('#imp-previa').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }).catch((e) => { fechar(); ui.erro(e); });
      }

      function desenharPrevia() {
        const alvo = el.querySelector('#imp-previa');
        if (!leitura || !analise) { alvo.innerHTML = ''; return; }
        const r = analise.resumo, aImportar = r.novas + r.atualizadas;
        const lista = analise.itens.filter((i) => !filtro || i.situacao === filtro);
        const pg = ui.paginar(lista, pagina);
        pagina = pg.pagina;
        const abas = [['', 'Todas', r.lidas], ['nova', 'Novas', r.novas], ['atualizada', 'Atualizadas', r.atualizadas], ['inalterada', 'Sem alteração', r.inalteradas],
          ['sem_tsi', 'Sem ordem de TSI', r.semTsi], ['duplicada', 'Duplicadas', r.duplicadas]];
        const porCabecalho = leitura.mapeamento.filter((m) => m.origem === 'cabecalho').length;
        alvo.innerHTML = html`
          <section class="cartao imp-previa">
            <div class="imp-previa-topo">
              <div>
                <h2>Pré-visualização da importação</h2>
                <p class="texto-menor">${leitura.arquivoNome} · ${util.fmtBytes(leitura.arquivoTamanho)} · aba “${leitura.aba}” · cabeçalho na linha ${leitura.linhaCabecalho} ·
                  ${util.plural(r.lidas, 'linha com dados', 'linhas com dados')}${analise.cultura ? ' · cultura: ' + analise.cultura : ''}</p>
              </div>
              <div class="pagina-acoes">
                <button type="button" class="btn btn-fantasma" data-acao="descartar">Descartar</button>
                <button type="button" class="btn btn-primario" data-acao="confirmar" id="imp-confirmar" ${aImportar ? '' : ui.bruto('disabled')}>${icone('check', 18)}
                  <span>${aImportar ? 'Confirmar importação' : 'Nada a importar'}</span></button>
              </div>
            </div>
            ${!aImportar ? html`<div class="alerta alerta-info">${icone('info', 20)}<span>A base já está igual a esta planilha: não há ordens novas nem alterações.</span></div>` : ''}
            ${leitura.avisos.map((a) => html`<div class="alerta alerta-alerta">${icone('alerta', 20)}<span>${a}</span></div>`)}
            <div class="resumo-linha">
              <div><span>Ordens novas</span><strong id="imp-n-novas">${util.fmtNum(r.novas, 0)}</strong></div>
              <div><span>Já importadas, com alteração</span><strong id="imp-n-atualizadas">${util.fmtNum(r.atualizadas, 0)}</strong></div>
              <div><span>Já importadas, sem alteração</span><strong id="imp-n-inalteradas">${util.fmtNum(r.inalteradas, 0)}</strong></div>
              <div><span>Linhas sem ordem de TSI</span><strong id="imp-n-semtsi">${util.fmtNum(r.semTsi, 0)}</strong></div>
              <div><span>Ordens duplicadas na planilha</span><strong id="imp-n-duplicadas">${util.fmtNum(r.duplicadas, 0)}</strong></div>
            </div>
            <details class="imp-mapa">
              <summary>Colunas identificadas: ${porCabecalho} de ${leitura.mapeamento.length} pelo cabeçalho</summary>
              <div class="tabela-rolagem">
                <table class="tabela tabela-compacta">
                  <thead><tr><th>Informação</th><th>Coluna</th><th>Cabeçalho lido na planilha</th><th>Identificação</th></tr></thead>
                  <tbody>${leitura.mapeamento.map((m) => html`<tr><td>${m.rotulo}</td><td>${m.coluna || '—'}</td><td>${m.cabecalhoLido || '—'}</td>
                    <td>${m.origem === 'cabecalho' ? 'Pelo cabeçalho' : m.origem === 'posicao' ? 'Pela posição padrão do RQ70' : 'Não encontrada'}</td></tr>`)}</tbody>
                </table>
              </div>
            </details>
            <div class="abas" role="tablist" aria-label="Situação das linhas">
              ${abas.map((a) => html`<button type="button" role="tab" aria-selected="${filtro === a[0]}" class="${filtro === a[0] ? 'ativa' : ''}" data-acao="aba" data-aba="${a[0]}">${a[1]}<span>${util.fmtNum(a[2], 0)}</span></button>`)}
            </div>
            ${lista.length ? html`
              <div class="tabela-rolagem">
                <table class="tabela tabela-compacta">
                  <thead><tr><th class="num">Linha</th><th>Situação</th><th>Ordem de TSI</th><th>Solicitação</th><th>Lote</th><th>Cultivar</th><th>Tratamento</th>
                    <th>Tipo de embalagem</th><th class="num">Qtd. TSI</th><th>Ordem reemb.</th><th>Observações da importação</th></tr></thead>
                  <tbody>${pg.itens.map((i) => { const v = i.valores; return html`
                    <tr><td class="num">${i.linha}</td><td>${seloLinha(i.situacao)}</td><td><strong>${i.ordemTsi || '—'}</strong></td>
                      <td class="nowrap">${v.data ? util.fmtData(v.data) : (v.dataTexto || '—')}</td><td>${v.lote || '—'}</td><td>${v.cultivar || '—'}</td><td>${v.tratamento || '—'}</td>
                      <td>${v.tipoEmbalagem || '—'}</td><td class="num">${typeof v.qtdTsi === 'number' ? util.fmtNum(v.qtdTsi, 2) : (v.qtdTsi || '—')}</td><td>${v.ordemReembalagem || '—'}</td>
                      <td class="imp-obs">${observacao(i)}</td></tr>`; })}</tbody>
                </table>
              </div>
              ${ui.paginacao(pg, 'linhas')}` : ui.vazio('filtro', 'Nenhuma linha nesta situação')}
          </section>`;
      }

      function observacao(i) {
        const partes = [];
        if (i.situacao === 'sem_tsi') partes.push(html`<span>Sem número de ordem de TSI: a linha não será importada.</span>`);
        if (i.situacao === 'duplicada') partes.push(html`<span>Mesma ordem de TSI da linha ${i.primeiraLinha}: esta linha não será importada.</span>`);
        if (i.situacao === 'atualizada') i.diferencas.forEach((d) => partes.push(html`<span>${d.rotulo}: <s>${d.de}</s> → <b>${d.para}</b></span>`));
        i.erros.forEach((e) => partes.push(html`<span>${e.rotulo}: célula com erro ${e.erro}, importada vazia.</span>`));
        return partes;
      }

      function confirmar(botao) {
        const fechar = ui.carregando('Gravando as ordens…');
        ui.ocupar(botao, () => TSI.importacao.confirmar(leitura, cultura)).then((imp) => {
          fechar();
          const r = imp.resumo;
          ui.aviso('Importação concluída: ' + util.plural(r.novas, 'ordem nova', 'ordens novas') + ' e ' + util.plural(r.atualizadas, 'atualizada', 'atualizadas') + '.', 'ok', 6000);
          leitura = null; analise = null;
          el.querySelector('#imp-arquivo').value = '';
          desenharPrevia();
          return carregarHistorico();
        }).catch((e) => { fechar(); ui.erro(e); });
      }

      const solta = el.querySelector('#imp-solta'), entrada = el.querySelector('#imp-arquivo');
      ['dragenter', 'dragover'].forEach((n) => solta.addEventListener(n, (ev) => { ev.preventDefault(); solta.classList.add('sobre'); }));
      ['dragleave', 'drop'].forEach((n) => solta.addEventListener(n, (ev) => { ev.preventDefault(); solta.classList.remove('sobre'); }));
      solta.addEventListener('drop', (ev) => { const a = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (a) processar(a); });
      entrada.addEventListener('change', () => processar(entrada.files && entrada.files[0]));

      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const acao = b.dataset.acao;
        if (acao === 'escolher') { entrada.value = ''; entrada.click(); }
        else if (acao === 'descartar') { leitura = null; analise = null; entrada.value = ''; desenharPrevia(); }
        else if (acao === 'confirmar') confirmar(b);
        else if (acao === 'aba') { filtro = b.dataset.aba; pagina = 1; desenharPrevia(); }
        else if (acao === 'pagina') { pagina = Number(b.dataset.pagina); desenharPrevia(); }
        else if (acao === 'ver-planilha') { const imp = importacoes.filter((i) => i.id === b.dataset.id)[0]; if (imp) abrirPlanilha(imp); }
      });
      el.querySelector('#imp-cultura').addEventListener('change', (ev) => {
        cultura = util.limpar(ev.target.value);
        if (!leitura) return;
        TSI.importacao.analisar(leitura, cultura).then((a) => { analise = a; pagina = 1; desenharPrevia(); }).catch(ui.erro);
      });

      carregarHistorico();
      return function desmontar() { montado = false; };
    }
  };
})(window);
