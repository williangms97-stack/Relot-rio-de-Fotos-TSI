/* ==========================================================================
   Importação da planilha RQ70: envio, pré-visualização, confirmação e histórico
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, util, config: cfg } = TSI;
  const { html, icone } = ui;
  const ROT = () => TSI.importacao.ROTULO_SITUACAO;
  const CLASSE_SELO = { nova: 'selo-registrada', atualizada: 'selo-info', inalterada: 'selo-neutro', sem_tsi: 'selo-pendente', sem_identificacao: 'selo-cancelada', duplicada: 'selo-cancelada', substituida: 'selo-neutro' };
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
      let leituras = [], analise = null, escolhas = {}, filtro = '', pagina = 1, importacoes = [], montado = true;
      const CULTURAS = TSI.importacao.CULTURAS;

      el.innerHTML = html`
        <header class="pagina-topo">
          <div><h1>Importar RQ70</h1><p>Planilhas de Solicitação de Reembalagem e Tratamento: a fonte dos lotes a fotografar</p></div>
        </header>
        <section class="cartao imp-envio" id="imp-envio">
          <div class="imp-solta" id="imp-solta">
            <span class="imp-solta-icone">${icone('upload', 30)}</span>
            <strong>Arraste uma ou várias planilhas RQ70 para esta área</strong>
            <button type="button" class="btn btn-primario" data-acao="escolher">${icone('planilha', 18)}<span>Selecionar planilhas</span></button>
            <input type="file" id="imp-arquivo" class="so-leitor" tabindex="-1" aria-label="Arquivos das planilhas RQ70" multiple
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel">
            <span class="texto-menor">Arquivos .xlsx ou .xls. Pode misturar culturas (soja, milho, trigo…) no mesmo envio. Nada é gravado antes da sua confirmação.</span>
          </div>
          <div class="imp-explica">
            <h2 class="secao-titulo">Como funciona</h2>
            <ul>
              <li><strong>Cultura:</strong> reconhecida pelo conteúdo de cada linha (cultivar, peneira, embalagem). O nome do arquivo não importa.</li>
              <li><strong>Lotes já importados:</strong> sem mudança ficam como estão; com mudança são atualizados e a alteração vai para o histórico.</li>
              <li><strong>O que não vier na planilha</strong> continua no sistema, sem mudança. Pode importar só o RQ mais recente.</li>
              <li><strong>Lote sem ordem de TSI</strong> também entra e pode ser fotografado. Quando a ordem sair num RQ novo, ela é ligada ao mesmo lote.</li>
            </ul>
          </div>
        </section>
        <div id="imp-previa"></div>
        <section class="imp-historico">
          <h2 class="secao-titulo">Histórico de importações</h2>
          <div id="imp-historico"><p class="texto-menor">Carregando…</p></div>
        </section>`;

      function carregarHistorico() {
        return TSI.importacao.listar().then((l) => {
          if (!montado) return;
          importacoes = l;
          const alvo = el.querySelector('#imp-historico');
          alvo.innerHTML = importacoes.length ? html`
            <div class="cartao cartao-tabela">
              <div class="tabela-rolagem">
                <table class="tabela">
                  <thead><tr><th>Data e horário</th><th>Responsável</th><th>Arquivo</th><th>Culturas</th><th class="num">Linhas lidas</th><th class="num">Novas</th>
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

      function analisar() {
        if (!leituras.length) { analise = null; desenharPrevia(); return Promise.resolve(); }
        return TSI.importacao.analisar(leituras, escolhas).then((a) => { analise = a; desenharPrevia(); });
      }

      /** Lê os arquivos escolhidos (um de cada vez) e junta aos que já estavam na lista. */
      function processar(arquivos) {
        arquivos = Array.from(arquivos || []);
        if (!arquivos.length) return;
        const fechar = ui.carregando(arquivos.length > 1 ? 'Lendo ' + arquivos.length + ' planilhas… Arquivos grandes podem levar alguns segundos.'
          : 'Lendo a planilha… Arquivos grandes podem levar alguns segundos.');
        const erros = [];
        arquivos.reduce((cadeia, arq) => cadeia.then(() => util.proximoQuadro()).then(() => TSI.importacao.ler(arq)).then((l) => {
          leituras = leituras.filter((x) => x.arquivoNome !== l.arquivoNome).concat([l]);   // mesmo nome: vale o novo
        }, (e) => { erros.push(arq.name + ': ' + ((e && e.message) || 'não foi possível ler')); }), util.proximoQuadro())
          .then(() => analisar())
          .then(() => {
            fechar();
            filtro = ''; pagina = 1;
            desenharPrevia();
            if (erros.length) ui.aviso(erros.join(' · '), 'erro', 9000);
            if (analise) el.querySelector('#imp-previa').scrollIntoView({ behavior: 'smooth', block: 'start' });
          }).catch((e) => { fechar(); ui.erro(e); });
      }

      function confirmar(botao) {
        const fechar = ui.carregando('Gravando os lotes…');
        ui.ocupar(botao, () => TSI.importacao.confirmar(leituras, escolhas)).then((res) => {
          fechar();
          const r = res.resumo;
          ui.aviso('Importação concluída: ' + util.plural(r.novas, 'lote novo', 'lotes novos') + ' e ' + util.plural(r.atualizadas, 'atualizado', 'atualizados') + '.', 'ok', 6000);
          limpar();
          return carregarHistorico();
        }).catch((e) => { fechar(); ui.erro(e); });
      }

      function limpar() {
        leituras = []; analise = null; escolhas = {};
        el.querySelector('#imp-arquivo').value = '';
        desenharPrevia();
      }

      /* ---------- Pré-visualização ---------- */
      const visivel = (i) => i.ordem && ['nova', 'atualizada', 'inalterada'].indexOf(i.situacao) >= 0;
      const ABAS = [
        ['', 'Todas', () => true],
        ['nova', 'Novos', (i) => i.situacao === 'nova'],
        ['atualizada', 'Atualizados', (i) => i.situacao === 'atualizada'],
        ['inalterada', 'Sem alteração', (i) => i.situacao === 'inalterada'],
        ['sem_ordem', 'Sem ordem de TSI', (i) => visivel(i) && !i.ordem.ordemTsi],
        ['sem_cultura', 'Cultura não identificada', (i) => visivel(i) && !i.ordem.cultura],
        ['aviso', 'Com aviso', (i) => visivel(i) && i.avisos.length > 0],
        ['ignoradas', 'Ignoradas', (i) => ['duplicada', 'substituida', 'sem_identificacao'].indexOf(i.situacao) >= 0]
      ];

      function desenharPrevia() {
        const alvo = el.querySelector('#imp-previa');
        if (!analise) { alvo.innerHTML = ''; return; }
        const r = analise.resumo, aImportar = r.novas + r.atualizadas, varios = analise.arquivos.length > 1;
        const aba = ABAS.filter((a) => a[0] === filtro)[0] || ABAS[0];
        const lista = analise.itens.filter(aba[2]);
        const pg = ui.paginar(lista, pagina);
        pagina = pg.pagina;
        alvo.innerHTML = html`
          <section class="cartao imp-previa">
            <div class="imp-previa-topo">
              <div>
                <h2>Pré-visualização da importação</h2>
                <p class="texto-menor">${util.plural(analise.arquivos.length, 'arquivo', 'arquivos')} · ${util.plural(r.lidas, 'linha lida', 'linhas lidas')}
                  ${TSI.importacao.textoCulturas(analise.culturas) ? ' · ' + TSI.importacao.textoCulturas(analise.culturas) : ''}</p>
              </div>
              <div class="pagina-acoes">
                <button type="button" class="btn btn-fantasma" data-acao="descartar">Descartar</button>
                <button type="button" class="btn btn-secundario" data-acao="escolher">${icone('mais', 18)}<span>Adicionar arquivo</span></button>
                <button type="button" class="btn btn-primario" data-acao="confirmar" id="imp-confirmar" ${aImportar ? '' : ui.bruto('disabled')}>${icone('check', 18)}
                  <span>${aImportar ? 'Confirmar importação' : 'Nada a importar'}</span></button>
              </div>
            </div>
            ${!aImportar ? html`<div class="alerta alerta-info">${icone('info', 20)}<span>A base já está igual a estas planilhas: não há lotes novos nem alterações.</span></div>` : ''}
            ${r.semCultura ? html`<div class="alerta alerta-alerta">${icone('alerta', 20)}<div>
              <strong>${util.plural(r.semCultura, 'lote ficou', 'lotes ficaram')} com a cultura não identificada.</strong>
              <p>Escolha a cultura na coluna “Cultura” (aba “Cultura não identificada”) ou em cada arquivo abaixo. Se confirmar assim, eles ficam como “Não identificada”.</p></div></div>` : ''}
            ${r.fotografadas ? html`<div class="alerta alerta-alerta">${icone('camera', 20)}<span>${util.plural(r.fotografadas, 'lote já fotografado terá', 'lotes já fotografados terão')} dados alterados pela planilha. O registro fotográfico feito não muda; confira na aba “Com aviso”.</span></div>` : ''}
            ${r.mudancaCultura ? html`<div class="alerta alerta-alerta">${icone('alerta', 20)}<span>${util.plural(r.mudancaCultura, 'lote vai', 'lotes vão')} mudar de cultura. Confira na aba “Com aviso”.</span></div>` : ''}
            ${r.vinculadas ? html`<div class="alerta alerta-info">${icone('info', 20)}<span>${util.plural(r.vinculadas, 'lote que estava sem ordem recebeu', 'lotes que estavam sem ordem receberam')} o número da ordem nesta planilha.</span></div>` : ''}

            <div class="resumo-linha">
              <div><span>Lotes novos</span><strong>${util.fmtNum(r.novas, 0)}</strong></div>
              <div><span>Já importados, com alteração</span><strong>${util.fmtNum(r.atualizadas, 0)}</strong></div>
              <div><span>Já importados, sem alteração</span><strong>${util.fmtNum(r.inalteradas, 0)}</strong></div>
              <div><span>Sem ordem de TSI</span><strong>${util.fmtNum(r.semOrdem, 0)}</strong></div>
              <div><span>Linhas ignoradas</span><strong>${util.fmtNum(r.duplicadas + r.substituidas + r.semIdentificacao, 0)}</strong></div>
            </div>

            <div class="imp-arquivos">${analise.arquivos.map((a) => {
              const semCultura = (a.culturas || {})['Não identificada'] || 0;
              return html`
              <div class="imp-arquivo">
                <div class="imp-arquivo-topo">
                  <span>${icone('planilha', 18)}<strong>${a.nome}</strong></span>
                  <button type="button" class="btn-icone" data-acao="remover-arquivo" data-nome="${a.nome}" aria-label="Tirar ${a.nome} desta importação">${icone('x', 18)}</button>
                </div>
                <p class="texto-menor">aba “${a.aba}” · cabeçalho na linha ${a.linhaCabecalho} · ${util.plural(a.resumo.lidas, 'linha', 'linhas')} ·
                  ${a.resumo.novas} novos · ${a.resumo.atualizadas} atualizados · ${a.resumo.inalteradas} sem alteração${a.resumo.semOrdem ? ' · ' + a.resumo.semOrdem + ' sem ordem' : ''}</p>
                <p class="imp-culturas">${Object.keys(a.culturas || {}).sort().map((c) => ui.seloSimples(c + ': ' + util.fmtNum(a.culturas[c], 0), c === 'Não identificada' ? 'selo-pendente' : 'selo-info'))}</p>
                ${semCultura ? html`<div class="imp-arquivo-cultura">
                  <label for="imp-cult-${a.indice}">Cultura dos ${util.fmtNum(semCultura, 0)} lotes não identificados deste arquivo</label>
                  <span><select id="imp-cult-${a.indice}">${ui.opcoes(CULTURAS, '', 'Escolher…')}</select>
                  <button type="button" class="btn btn-secundario btn-p" data-acao="cultura-arquivo" data-arquivo="${a.indice}">Aplicar</button></span>
                </div>` : ''}
                ${a.avisos.map((t) => html`<p class="texto-menor imp-aviso">${icone('alerta', 14)}${t}</p>`)}
                <details class="imp-mapa">
                  <summary>Colunas identificadas: ${a.mapeamento.filter((m) => m.origem === 'cabecalho').length} de ${a.mapeamento.length} pelo cabeçalho</summary>
                  <div class="tabela-rolagem">
                    <table class="tabela tabela-compacta">
                      <thead><tr><th>Informação</th><th>Coluna</th><th>Cabeçalho lido na planilha</th><th>Identificação</th></tr></thead>
                      <tbody>${a.mapeamento.map((m) => html`<tr><td>${m.rotulo}</td><td>${m.coluna || '—'}</td><td>${m.cabecalhoLido || '—'}</td>
                        <td>${m.origem === 'cabecalho' ? 'Pelo cabeçalho' : m.origem === 'posicao' ? 'Pela posição padrão do RQ70' : 'Não encontrada'}</td></tr>`)}</tbody>
                    </table>
                  </div>
                </details>
              </div>`; })}
            </div>

            <div class="abas" role="tablist" aria-label="Situação das linhas">
              ${ABAS.map((a) => { const n = analise.itens.filter(a[2]).length; return (n || !a[0] || a[0] === filtro) ? html`<button type="button" role="tab" aria-selected="${filtro === a[0]}" class="${filtro === a[0] ? 'ativa' : ''}" data-acao="aba" data-aba="${a[0]}">${a[1]}<span>${util.fmtNum(n, 0)}</span></button>` : ''; })}
            </div>
            ${lista.length ? html`
              <div class="tabela-rolagem">
                <table class="tabela tabela-compacta">
                  <thead><tr>${varios ? html`<th>Arquivo</th>` : ''}<th class="num">Linha</th><th>Situação</th><th>Ordem de TSI</th><th>Lote</th><th>Cultivar</th><th>Cultura</th>
                    <th>Solicitação</th><th>Tratamento</th><th class="num">Qtd. TSI</th><th>Observações da importação</th></tr></thead>
                  <tbody>${pg.itens.map((i) => { const v = i.valores; return html`
                    <tr>${varios ? html`<td class="texto-menor">${analise.arquivos[i.arquivo].nome}</td>` : ''}<td class="num">${i.linha}</td><td>${seloLinha(i.situacao)}</td>
                      <td><strong>${i.ordem ? TSI.ordens.numeroOrdem(i.ordem) : (v.ordemTsi || '—')}</strong></td>
                      <td class="nowrap">${v.lote || '—'}</td><td>${v.cultivar || '—'}</td>
                      <td>${visivel(i) ? html`<select class="imp-cultura-linha ${i.ordem.cultura ? '' : 'imp-sem-cultura'}" data-item="${i.id}" aria-label="Cultura da linha ${i.linha}">
                        ${ui.opcoes(util.unicos(CULTURAS.concat(i.ordem.cultura ? [i.ordem.cultura] : [])), i.ordem.cultura || '', 'Não identificada')}</select>
                        ${i.origemCultura === 'arquivo' ? html`<span class="texto-menor">pelo arquivo</span>` : ''}` : '—'}</td>
                      <td class="nowrap">${v.data ? util.fmtData(v.data) : (v.dataTexto || '—')}</td><td>${v.tratamento || '—'}</td>
                      <td class="num">${typeof v.qtdTsi === 'number' ? util.fmtNum(v.qtdTsi, 2) : (v.qtdTsi || '—')}</td>
                      <td class="imp-obs">${observacao(i)}</td></tr>`; })}</tbody>
                </table>
              </div>
              ${ui.paginacao(pg, 'linhas')}` : ui.vazio('filtro', 'Nenhuma linha nesta situação')}
          </section>`;
      }

      function observacao(i) {
        const partes = [];
        if (i.situacao === 'sem_identificacao') partes.push(html`<span>Sem ordem de TSI e sem lote: a linha não será importada.</span>`);
        if (i.situacao === 'duplicada') partes.push(html`<span>Mesmo lote da linha ${i.primeiraLinha} deste arquivo: esta linha não será importada.</span>`);
        if (i.situacao === 'substituida') partes.push(html`<span>Este lote também está em “${i.substituidaPor}”, que é mais novo: vale a linha de lá.</span>`);
        if (i.situacao === 'nova' && i.ordem && !i.ordem.ordemTsi) partes.push(html`<span>Lote sem ordem de TSI: poderá ser fotografado pela pesquisa do lote.</span>`);
        if (i.situacao === 'atualizada') i.diferencas.forEach((d) => partes.push(html`<span>${d.rotulo}: <s>${d.de}</s> → <b>${d.para}</b></span>`));
        i.avisos.forEach((t) => partes.push(html`<span class="imp-aviso">${icone('alerta', 14)}${t}</span>`));
        i.erros.forEach((e) => partes.push(html`<span>${e.rotulo}: célula com erro ${e.erro}, importada vazia.</span>`));
        return partes;
      }

      const solta = el.querySelector('#imp-solta'), entrada = el.querySelector('#imp-arquivo');
      ['dragenter', 'dragover'].forEach((n) => solta.addEventListener(n, (ev) => { ev.preventDefault(); solta.classList.add('sobre'); }));
      ['dragleave', 'drop'].forEach((n) => solta.addEventListener(n, (ev) => { ev.preventDefault(); solta.classList.remove('sobre'); }));
      solta.addEventListener('drop', (ev) => { const a = ev.dataTransfer && ev.dataTransfer.files; if (a && a.length) processar(a); });
      entrada.addEventListener('change', () => processar(entrada.files));

      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const acao = b.dataset.acao;
        if (acao === 'escolher') { entrada.value = ''; entrada.click(); }
        else if (acao === 'descartar') limpar();
        else if (acao === 'confirmar') confirmar(b);
        else if (acao === 'aba') { filtro = b.dataset.aba; pagina = 1; desenharPrevia(); }
        else if (acao === 'pagina') { pagina = Number(b.dataset.pagina); desenharPrevia(); }
        else if (acao === 'remover-arquivo') {
          leituras = leituras.filter((l) => l.arquivoNome !== b.dataset.nome);
          escolhas = {};
          analisar().catch(ui.erro);
        } else if (acao === 'cultura-arquivo') {
          const c = el.querySelector('#imp-cult-' + b.dataset.arquivo).value;
          if (!c) { ui.aviso('Escolha a cultura antes de aplicar.', 'alerta'); return; }
          analise.itens.forEach((i) => { if (String(i.arquivo) === b.dataset.arquivo && visivel(i) && !i.ordem.cultura) escolhas[i.id] = c; });
          analisar().catch(ui.erro);
        } else if (acao === 'ver-planilha') { const imp = importacoes.filter((i) => i.id === b.dataset.id)[0]; if (imp) abrirPlanilha(imp); }
      });
      el.addEventListener('change', (ev) => {
        const s = ev.target.closest('.imp-cultura-linha');
        if (!s) return;
        if (s.value) escolhas[s.dataset.item] = s.value; else delete escolhas[s.dataset.item];
        analisar().catch(ui.erro);
      });

      carregarHistorico();
      return function desmontar() { montado = false; };
    }
  };
})(window);
