/* ==========================================================================
   Cadastro de máquinas (exclusivo do ADM)
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, util } = TSI;
  const { html, icone } = ui;

  function formulario(maquina, aoSalvar) {
    const m = ui.modal({
      titulo: maquina ? 'Editar máquina' : 'Nova máquina', largura: 'p',
      conteudo: html`
        <form id="form-maquina" class="formulario" novalidate>
          <div class="campo"><label for="maquina-nome">Identificação</label>
            <input type="text" id="maquina-nome" maxlength="40" value="${maquina ? maquina.nome : ''}" placeholder="Ex.: Linha 04" autocomplete="off"></div>
          <p class="campo-ajuda">É o nome que o operador verá ao selecionar a máquina. Registros já feitos mantêm o nome da época.</p>
          <p class="form-erro" id="maquina-erro" role="alert" hidden></p>
        </form>`,
      acoes: [
        { rotulo: 'Voltar', classe: 'btn-secundario', acao: (mm) => mm.fechar() },
        { rotulo: maquina ? 'Salvar' : 'Cadastrar máquina', classe: 'btn-primario', id: 'maquina-salvar', acao: (mm, botao) => salvar(mm, botao) }
      ]
    });
    function salvar(mm, botao) {
      const nome = mm.corpo.querySelector('#maquina-nome').value;
      ui.ocupar(botao, () => (maquina ? TSI.maquinas.renomear(maquina.id, nome) : TSI.maquinas.criar(nome)).then(() => {
        mm.fechar();
        ui.aviso(maquina ? 'Máquina atualizada.' : 'Máquina cadastrada e disponível para os operadores.', 'ok');
        aoSalvar();
      })).catch((e) => { const er = mm.corpo.querySelector('#maquina-erro'); er.textContent = ui.mensagemDe(e); er.hidden = false; if (!e || !e.amigavel) console.error(e); });
    }
    m.corpo.querySelector('#form-maquina').addEventListener('submit', (ev) => { ev.preventDefault(); salvar(m, m.el.querySelector('#maquina-salvar')); });
  }

  function historicoDeUso(maquina) {
    const m = ui.modal({ titulo: 'Utilização da ' + maquina.nome, largura: 'g', conteudo: html`<p class="texto-menor">Carregando…</p>` });
    TSI.maquinas.registrosDa(maquina.id).then((regs) => {
      m.definirConteudo(regs.length ? html`
        <p class="texto-menor">${util.plural(regs.length, 'registro feito', 'registros feitos')} nesta máquina. Clique em uma linha para abrir o registro.</p>
        <div class="tabela-rolagem">
          <table class="tabela tabela-compacta">
            <thead><tr><th>Data e horário</th><th>Ordem</th><th>Lote</th><th>Cultivar</th><th>Operador</th><th class="num">Qtd. tratada</th><th>Situação</th></tr></thead>
            <tbody>${regs.map((r) => html`
              <tr class="linha-clicavel ${r.anulado ? 'linha-apagada' : ''}" data-id="${r.id}" tabindex="0">
                <td class="nowrap">${util.fmtDataHora(r.criadoEm)}</td><td><strong>${TSI.ordens.numeroOrdem(r)}</strong></td><td>${(r.ordem || {}).lote || '—'}</td><td>${(r.ordem || {}).cultivar || '—'}</td>
                <td>${r.operadorNome}</td><td class="num">${util.fmtNum(r.qtdEfetiva, 2)}</td>
                <td>${r.anulado ? ui.seloSimples('Anulado', 'selo-cancelada', 'anular') : ui.seloEnvio(r.situacaoEnvio)}</td>
              </tr>`)}</tbody>
          </table>
        </div>` : ui.vazio('maquina', 'Nenhum registro nesta máquina', 'Quando um operador selecionar esta máquina em um registro, ele aparecerá aqui.'));
      m.corpo.addEventListener('click', (ev) => { const l = ev.target.closest('tr[data-id]'); if (l) TSI.telas.adm.abrirRegistro(l.dataset.id); });
    }).catch(ui.erro);
  }

  TSI.telas.adm.maquinas = {
    montar(el) {
      let maquinas = [], uso = {}, montado = true;
      el.innerHTML = html`
        <header class="pagina-topo">
          <div><h1>Máquinas</h1><p>Linhas de tratamento que os operadores podem selecionar no registro</p></div>
          <div class="pagina-acoes"><button type="button" class="btn btn-primario" data-acao="nova">${icone('mais', 18)}<span>Nova máquina</span></button></div>
        </header>
        <div id="maquinas-lista" class="pilha"><p class="texto-menor">Carregando…</p></div>`;

      function carregar() {
        return Promise.all([TSI.maquinas.listar(), TSI.maquinas.uso()]).then((r) => {
          if (!montado) return;
          maquinas = r[0]; uso = r[1];
          el.querySelector('#maquinas-lista').innerHTML = html`
            <div class="cartao cartao-tabela">
              <div class="tabela-rolagem">
                <table class="tabela">
                  <thead><tr><th>Identificação</th><th>Situação</th><th class="num">Registros</th><th>Último uso</th><th>Ações</th></tr></thead>
                  <tbody>${maquinas.map((m) => { const u = uso[m.id] || { total: 0, ultimoUso: null }; return html`
                    <tr class="${m.ativa ? '' : 'linha-apagada'}">
                      <td><strong>${m.nome}</strong></td>
                      <td>${m.ativa ? ui.seloSimples('Ativa', 'selo-registrada', 'check') : ui.seloSimples('Inativa', 'selo-neutro', 'anular')}</td>
                      <td class="num">${util.fmtNum(u.total, 0)}</td>
                      <td class="nowrap">${u.ultimoUso ? util.fmtDataHora(u.ultimoUso) : 'Nunca utilizada'}</td>
                      <td><div class="acoes-linha">
                        <button type="button" class="btn btn-secundario btn-p" data-acao="editar" data-id="${m.id}">${icone('editar', 16)}<span>Editar</span></button>
                        <button type="button" class="btn btn-secundario btn-p" data-acao="${m.ativa ? 'desativar' : 'ativar'}" data-id="${m.id}">${icone(m.ativa ? 'anular' : 'check', 16)}<span>${m.ativa ? 'Desativar' : 'Ativar'}</span></button>
                        <button type="button" class="btn btn-fantasma btn-p" data-acao="uso" data-id="${m.id}">${icone('historico', 16)}<span>Utilização</span></button>
                      </div></td>
                    </tr>`; })}</tbody>
                </table>
              </div>
            </div>
            <p class="texto-menor">Máquinas inativas não aparecem para novos registros. Os registros já feitos nelas continuam disponíveis.</p>`;
        }).catch(ui.erro);
      }

      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const maq = maquinas.filter((m) => m.id === b.dataset.id)[0], acao = b.dataset.acao;
        if (acao === 'nova') formulario(null, carregar);
        else if (acao === 'editar' && maq) formulario(maq, carregar);
        else if (acao === 'uso' && maq) historicoDeUso(maq);
        else if (acao === 'ativar' && maq) TSI.maquinas.definirSituacao(maq.id, true).then(() => { ui.aviso(maq.nome + ' ativada.', 'ok'); return carregar(); }).catch(ui.erro);
        else if (acao === 'desativar' && maq) {
          ui.confirmar({ titulo: 'Desativar a ' + maq.nome + '?', mensagem: 'Ela deixa de aparecer para os operadores em novos registros. Você pode reativar quando quiser.', rotuloConfirmar: 'Desativar' })
            .then((r) => r && TSI.maquinas.definirSituacao(maq.id, false).then(() => { ui.aviso(maq.nome + ' desativada.', 'ok'); return carregar(); })).catch(ui.erro);
        }
      });
      const desligar = [TSI.eventos.ouvir('registros:alterado', carregar)];
      carregar();
      return function desmontar() { montado = false; desligar.forEach((f) => f()); };
    }
  };
})(window);
