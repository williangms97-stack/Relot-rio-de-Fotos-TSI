/* ==========================================================================
   Acesso ao sistema (versão demonstrativa)
   --------------------------------------------------------------------------
   ATENÇÃO: nesta etapa a conferência de usuário e senha acontece no próprio
   navegador e NÃO representa segurança de produção. Na integração com servidor,
   substitua entrar()/restaurar()/sair() por chamadas à API de autenticação
   (ex.: Supabase Auth, JWT próprio) mantendo as mesmas assinaturas.
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var util = TSI.util;
  var PERFIS = TSI.config.PERFIS;
  var CHAVE_SESSAO = 'tsi.sessao';

  var usuarioAtual = null;
  var modoAtual = null;   // interface em uso: 'ADM' (painel) ou 'OPERADOR' (app)

  function Erro(msg) { var e = new Error(msg); e.amigavel = true; return e; }

  function lerSessao() {
    try { return JSON.parse(global.localStorage.getItem(CHAVE_SESSAO) || 'null'); } catch (e) { return null; }
  }
  function gravarSessao(s) {
    try {
      if (s) global.localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
      else global.localStorage.removeItem(CHAVE_SESSAO);
    } catch (e) { /* armazenamento indisponível: a sessão vale só enquanto a página estiver aberta */ }
  }

  function publico(u) {
    return { id: u.id, nome: u.nome, usuario: u.usuario, perfil: u.perfil };
  }

  var auth = TSI.auth = {
    Erro: Erro,

    chaveLogin: function (login) { return util.limpar(login).toLowerCase(); },

    hashSenha: function (senha, sal) { return util.sha256(sal + '|' + senha); },

    /** Confere usuário, senha e perfil escolhido na tela de acesso. */
    entrar: function (login, senha, perfilEscolhido) {
      var chave = auth.chaveLogin(login);
      if (!chave || !senha) return Promise.reject(Erro('Informe o usuário e a senha.'));
      return TSI.repo.usuarios.umPorIndice('login', chave).then(function (u) {
        if (!u || auth.hashSenha(senha, u.sal) !== u.senhaHash) throw Erro('Usuário ou senha incorretos.');
        if (!u.ativo) throw Erro('Este usuário está inativo. Procure o administrador.');
        if (perfilEscolhido === PERFIS.ADM && u.perfil !== PERFIS.ADM) {
          throw Erro('Este usuário não tem perfil de Administrador. Selecione "Operador".');
        }
        usuarioAtual = publico(u);
        modoAtual = perfilEscolhido === PERFIS.ADM ? PERFIS.ADM : PERFIS.OPERADOR;
        gravarSessao({ usuarioId: u.id, modo: modoAtual, entrouEm: util.agora() });
        u.ultimoAcesso = util.agora();
        return TSI.repo.usuarios.salvar(u).then(function () { return usuarioAtual; });
      });
    },

    /** Retoma a sessão guardada neste aparelho, se o usuário continuar ativo. */
    restaurar: function () {
      var s = lerSessao();
      if (!s || !s.usuarioId) return Promise.resolve(null);
      return TSI.repo.usuarios.obter(s.usuarioId).then(function (u) {
        if (!u || !u.ativo) { gravarSessao(null); return null; }
        usuarioAtual = publico(u);
        modoAtual = (s.modo === PERFIS.ADM && u.perfil === PERFIS.ADM) ? PERFIS.ADM : PERFIS.OPERADOR;
        return usuarioAtual;
      });
    },

    sair: function () { usuarioAtual = null; modoAtual = null; gravarSessao(null); },

    usuario: function () { return usuarioAtual; },
    modo: function () { return modoAtual; },
    ehAdm: function () { return !!usuarioAtual && usuarioAtual.perfil === PERFIS.ADM; },

    /** O ADM pode alternar entre o painel e o app do operador. */
    definirModo: function (modo) {
      if (!usuarioAtual) return;
      if (modo === PERFIS.ADM && !auth.ehAdm()) return;
      modoAtual = modo;
      var s = lerSessao() || { usuarioId: usuarioAtual.id, entrouEm: util.agora() };
      s.modo = modo;
      gravarSessao(s);
    },

    /** Atualiza os dados em memória quando o próprio usuário é editado. */
    atualizarAtual: function (u) {
      if (usuarioAtual && u && u.id === usuarioAtual.id) usuarioAtual = publico(u);
    },

    exigirLogin: function () {
      if (!usuarioAtual) throw Erro('Sessão encerrada. Entre novamente.');
      return usuarioAtual;
    },
    exigirAdm: function () {
      if (!auth.ehAdm()) throw Erro('Operação permitida somente ao Administrador.');
      return usuarioAtual;
    }
  };
})(window);
