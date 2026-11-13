/* ==========================================================================
   Tela de acesso
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, config: cfg } = TSI;
  const { html, icone } = ui;
  const CHAVE_PERFIL = 'tsi.ultimoPerfil';

  const DICA = {
    OPERADOR: 'Registro fotográfico das ordens de tratamento durante a operação.',
    ADM: 'Painel de gestão: importação do RQ70, acompanhamento, cadastros e relatórios.'
  };

  function perfilInicial() {
    try {
      const salvo = global.localStorage.getItem(CHAVE_PERFIL);
      if (salvo === 'ADM' || salvo === 'OPERADOR') return salvo;
    } catch (e) { /* sem armazenamento */ }
    return global.matchMedia && global.matchMedia('(min-width: 900px)').matches ? 'ADM' : 'OPERADOR';
  }

  TSI.telas.login = {
    montar(raiz, aoEntrar) {
      const perfil = perfilInicial();
      raiz.innerHTML = html`
        <main class="login">
          <div class="login-coluna">
            <div class="login-marca">
              <img class="login-logo" src="${TSI.recursos.logo}" alt="Dois Marcos Sementes" width="${TSI.recursos.logoLargura}" height="${TSI.recursos.logoAltura}">
              <p class="login-sistema">${cfg.NOME_SISTEMA}</p>
            </div>

            <form class="login-cartao" id="form-login" novalidate>
              <h1>Acesso ao sistema</h1>
              <fieldset class="segmentado">
                <legend>Perfil de acesso</legend>
                <label>
                  <input type="radio" name="perfil" id="login-perfil-operador" value="OPERADOR" ${perfil === 'OPERADOR' ? ui.bruto('checked') : ''}>
                  <span>${icone('celular', 18)}Operador</span>
                </label>
                <label>
                  <input type="radio" name="perfil" id="login-perfil-adm" value="ADM" ${perfil === 'ADM' ? ui.bruto('checked') : ''}>
                  <span>${icone('painel', 18)}Administrador</span>
                </label>
              </fieldset>
              <p class="login-dica" id="login-dica">${DICA[perfil]}</p>

              <div class="campo">
                <label for="login-usuario">Usuário</label>
                <input id="login-usuario" name="usuario" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required>
              </div>
              <div class="campo">
                <label for="login-senha">Senha</label>
                <div class="campo-senha">
                  <input id="login-senha" name="senha" type="password" autocomplete="current-password" required>
                  <button type="button" class="btn-icone" id="login-ver-senha" aria-label="Mostrar senha" aria-pressed="false">${icone('olho', 20)}</button>
                </div>
              </div>
              <p class="form-erro" id="login-erro" role="alert" hidden></p>
              <button type="submit" class="btn btn-primario btn-g btn-bloco" id="login-entrar">Entrar</button>
            </form>

            <div class="login-demo" id="login-demo" hidden></div>
            <p class="login-rodape">Versão ${cfg.VERSAO} · Acesso demonstrativo · Dados guardados neste aparelho</p>
          </div>
        </main>`;

      const form = raiz.querySelector('#form-login');
      const erro = raiz.querySelector('#login-erro');
      const senha = raiz.querySelector('#login-senha');
      const perfilAtual = () => form.querySelector('input[name=perfil]:checked').value;

      form.addEventListener('change', (ev) => {
        if (ev.target.name !== 'perfil') return;
        raiz.querySelector('#login-dica').textContent = DICA[perfilAtual()];
        erro.hidden = true;
      });

      raiz.querySelector('#login-ver-senha').addEventListener('click', (ev) => {
        const b = ev.currentTarget, mostrar = senha.type === 'password';
        senha.type = mostrar ? 'text' : 'password';
        b.setAttribute('aria-pressed', String(mostrar));
        b.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
        b.innerHTML = icone(mostrar ? 'olhoOff' : 'olho', 20);
      });

      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        erro.hidden = true;
        const botao = raiz.querySelector('#login-entrar');
        ui.ocupar(botao, () => TSI.auth.entrar(form.usuario.value, senha.value, perfilAtual()).then(() => {
          try { global.localStorage.setItem(CHAVE_PERFIL, perfilAtual()); } catch (e) { /* sem armazenamento */ }
          aoEntrar();
        })).catch((e) => {
          erro.textContent = ui.mensagemDe(e);
          erro.hidden = false;
          if (!e || !e.amigavel) console.error(e);
          senha.select();
        });
      });

      // Acessos iniciais ainda com a senha de fábrica: mostrados até o ADM redefinir as senhas
      TSI.usuarios.acessosIniciaisAtivos().then((acessos) => {
        if (!acessos.length || !raiz.querySelector('#login-demo')) return;
        const demo = raiz.querySelector('#login-demo');
        demo.hidden = false;
        demo.innerHTML = html`
          <h2>${icone('info', 18)}Primeiro acesso</h2>
          <p>Use os acessos iniciais abaixo e redefina as senhas em <strong>Usuários</strong>. Depois disso, este quadro deixa de aparecer.</p>
          <ul>
            ${acessos.map((a) => html`<li><span>${cfg.ROTULO_PERFIL[a.perfil]}</span><code>${a.usuario}</code><code>${a.senha}</code>
              <button type="button" class="btn btn-fantasma btn-p" data-preencher="${a.usuario}">Preencher</button></li>`)}
          </ul>`;
        demo.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-preencher]');
          if (!b) return;
          const a = acessos.filter((x) => x.usuario === b.dataset.preencher)[0];
          form.usuario.value = a.usuario;
          senha.value = a.senha;
          form.querySelector('input[name=perfil][value=' + a.perfil + ']').checked = true;
          raiz.querySelector('#login-dica').textContent = DICA[a.perfil];
          erro.hidden = true;
          raiz.querySelector('#login-entrar').focus();
        });
      }).catch(() => { /* quadro opcional */ });

      return () => { raiz.innerHTML = ''; };
    }
  };
})(window);
