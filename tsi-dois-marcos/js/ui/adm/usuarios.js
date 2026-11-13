/* ==========================================================================
   Cadastro de usuários (exclusivo do ADM)
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, util, config: cfg } = TSI;
  const { html, icone } = ui;
  const PERFIS = Object.keys(cfg.ROTULO_PERFIL).map((k) => ({ valor: k, rotulo: cfg.ROTULO_PERFIL[k] }));

  function mostrarErro(mm, seletor, e) {
    const er = mm.corpo.querySelector(seletor);
    er.textContent = ui.mensagemDe(e); er.hidden = false;
    if (!e || !e.amigavel) console.error(e);
  }

  function formulario(usuario, aoSalvar) {
    const novo = !usuario;
    const m = ui.modal({
      titulo: novo ? 'Novo usuário' : 'Editar usuário', largura: 'm',
      conteudo: html`
        <form id="form-usuario" class="formulario" novalidate>
          <div class="campo"><label for="usuario-nome">Nome completo</label>
            <input type="text" id="usuario-nome" maxlength="80" value="${usuario ? usuario.nome : ''}" autocomplete="off"></div>
          <div class="formulario-linha">
            <div class="campo"><label for="usuario-login">Nome de usuário</label>
              <input type="text" id="usuario-login" maxlength="30" value="${usuario ? usuario.usuario : ''}" autocapitalize="none" spellcheck="false" autocomplete="off"></div>
            <div class="campo"><label for="usuario-perfil">Perfil de acesso</label>
              <select id="usuario-perfil">${ui.opcoes(PERFIS, usuario ? usuario.perfil : 'OPERADOR')}</select></div>
          </div>
          ${novo ? html`
            <div class="formulario-linha">
              <div class="campo"><label for="usuario-senha">Senha inicial</label>
                <input type="text" id="usuario-senha" maxlength="60" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
              <div class="campo"><label for="usuario-situacao">Situação</label>
                <select id="usuario-situacao"><option value="1" selected>Ativo</option><option value="0">Inativo</option></select></div>
            </div>
            <p class="campo-ajuda">Mínimo de ${cfg.SENHA_MINIMA} caracteres. Informe a senha ao usuário; ela pode ser redefinida depois.</p>` : ''}
          <p class="form-erro" id="usuario-erro" role="alert" hidden></p>
        </form>`,
      acoes: [
        { rotulo: 'Voltar', classe: 'btn-secundario', acao: (mm) => mm.fechar() },
        { rotulo: novo ? 'Cadastrar usuário' : 'Salvar', classe: 'btn-primario', id: 'usuario-salvar', acao: (mm, botao) => {
          const q = (s) => mm.corpo.querySelector(s);
          const dados = { nome: q('#usuario-nome').value, usuario: q('#usuario-login').value, perfil: q('#usuario-perfil').value };
          if (novo) { dados.senha = q('#usuario-senha').value; dados.ativo = q('#usuario-situacao').value === '1'; }
          ui.ocupar(botao, () => (novo ? TSI.usuarios.criar(dados) : TSI.usuarios.editar(usuario.id, dados)).then(() => {
            mm.fechar(); ui.aviso(novo ? 'Usuário cadastrado.' : 'Usuário atualizado.', 'ok'); aoSalvar();
          })).catch((e) => mostrarErro(mm, '#usuario-erro', e));
        } }
      ]
    });
    return m;
  }

  function redefinirSenha(usuario, aoSalvar) {
    ui.modal({
      titulo: 'Redefinir a senha de ' + usuario.nome, largura: 'p',
      conteudo: html`
        <form class="formulario" novalidate>
          <div class="campo"><label for="senha-nova">Nova senha</label>
            <input type="text" id="senha-nova" maxlength="60" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
          <p class="campo-ajuda">Mínimo de ${cfg.SENHA_MINIMA} caracteres. A senha anterior deixa de funcionar imediatamente.</p>
          <p class="form-erro" id="senha-erro" role="alert" hidden></p>
        </form>`,
      acoes: [
        { rotulo: 'Voltar', classe: 'btn-secundario', acao: (mm) => mm.fechar() },
        { rotulo: 'Redefinir senha', classe: 'btn-primario', id: 'senha-salvar', acao: (mm, botao) => {
          ui.ocupar(botao, () => TSI.usuarios.redefinirSenha(usuario.id, mm.corpo.querySelector('#senha-nova').value).then(() => {
            mm.fechar(); ui.aviso('Senha de ' + usuario.nome + ' redefinida.', 'ok'); aoSalvar();
          })).catch((e) => mostrarErro(mm, '#senha-erro', e));
        } }
      ]
    });
  }

  TSI.telas.adm.usuarios = {
    montar(el) {
      let usuarios = [], montado = true;
      const eu = TSI.auth.usuario();
      el.innerHTML = html`
        <header class="pagina-topo">
          <div><h1>Usuários</h1><p>Operadores e administradores com acesso ao sistema</p></div>
          <div class="pagina-acoes"><button type="button" class="btn btn-primario" data-acao="novo">${icone('mais', 18)}<span>Novo usuário</span></button></div>
        </header>
        <div id="usuarios-lista" class="pilha"><p class="texto-menor">Carregando…</p></div>`;

      function carregar() {
        return TSI.usuarios.listar().then((l) => {
          if (!montado) return;
          usuarios = l;
          const padrao = l.filter((u) => u.senhaPadrao && u.ativo);
          el.querySelector('#usuarios-lista').innerHTML = html`
            ${padrao.length ? html`<div class="alerta alerta-alerta">${icone('alerta', 20)}<div><strong>Acessos iniciais com a senha de fábrica</strong>
              <p>${padrao.map((u) => u.usuario).join(', ')}: redefina a senha ou desative antes de liberar o sistema para a equipe.</p></div></div>` : ''}
            <div class="cartao cartao-tabela">
              <div class="tabela-rolagem">
                <table class="tabela">
                  <thead><tr><th>Nome completo</th><th>Nome de usuário</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th>Ações</th></tr></thead>
                  <tbody>${l.map((u) => html`
                    <tr class="${u.ativo ? '' : 'linha-apagada'}">
                      <td><strong>${u.nome}</strong>${u.id === eu.id ? html` <span class="texto-menor">(você)</span>` : ''}</td>
                      <td>${u.usuario}</td>
                      <td>${cfg.ROTULO_PERFIL[u.perfil]}</td>
                      <td>${u.ativo ? ui.seloSimples('Ativo', 'selo-registrada', 'check') : ui.seloSimples('Inativo', 'selo-neutro', 'anular')}</td>
                      <td class="nowrap">${u.ultimoAcesso ? util.fmtDataHora(u.ultimoAcesso) : 'Nunca acessou'}</td>
                      <td><div class="acoes-linha">
                        <button type="button" class="btn btn-secundario btn-p" data-acao="editar" data-id="${u.id}">${icone('editar', 16)}<span>Editar</span></button>
                        <button type="button" class="btn btn-secundario btn-p" data-acao="senha" data-id="${u.id}">${icone('cadeado', 16)}<span>Redefinir senha</span></button>
                        <button type="button" class="btn btn-fantasma btn-p" data-acao="${u.ativo ? 'desativar' : 'ativar'}" data-id="${u.id}">${icone(u.ativo ? 'anular' : 'check', 16)}<span>${u.ativo ? 'Desativar' : 'Ativar'}</span></button>
                      </div></td>
                    </tr>`)}</tbody>
                </table>
              </div>
            </div>
            <p class="texto-menor">Cada registro guarda automaticamente o usuário, o nome do operador, a data e o horário. O acesso desta versão é demonstrativo e será substituído por autenticação no servidor.</p>`;
        }).catch(ui.erro);
      }

      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const u = usuarios.filter((x) => x.id === b.dataset.id)[0], acao = b.dataset.acao;
        if (acao === 'novo') formulario(null, carregar);
        else if (acao === 'editar' && u) formulario(u, carregar);
        else if (acao === 'senha' && u) redefinirSenha(u, carregar);
        else if (acao === 'ativar' && u) TSI.usuarios.definirSituacao(u.id, true).then(() => { ui.aviso(u.nome + ' reativado.', 'ok'); return carregar(); }).catch(ui.erro);
        else if (acao === 'desativar' && u) {
          ui.confirmar({ titulo: 'Desativar ' + u.nome + '?', mensagem: 'O usuário não conseguirá mais entrar no sistema. Os registros feitos por ele continuam guardados.', rotuloConfirmar: 'Desativar' })
            .then((r) => r && TSI.usuarios.definirSituacao(u.id, false).then(() => { ui.aviso(u.nome + ' desativado.', 'ok'); return carregar(); })).catch(ui.erro);
        }
      });
      carregar();
      return function desmontar() { montado = false; };
    }
  };
})(window);
