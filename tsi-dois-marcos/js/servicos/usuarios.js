/* ==========================================================================
   Usuários — cadastro administrado pelo ADM
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var util = TSI.util, cfg = TSI.config, repo = function () { return TSI.repo; };
  var Erro = function (m) { return TSI.auth.Erro(m); };
  var H = function () { return TSI.historico; };

  function validar(d, exigirSenha) {
    var nome = util.limpar(d.nome), usuario = util.limpar(d.usuario);
    if (nome.length < 3) throw Erro('Informe o nome completo.');
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(usuario)) throw Erro('O nome de usuário deve ter de 3 a 30 letras ou números, sem espaços.');
    if (!cfg.ROTULO_PERFIL[d.perfil]) throw Erro('Selecione o perfil de acesso.');
    if (exigirSenha) validarSenha(d.senha);
    return { nome: nome, usuario: usuario };
  }
  function validarSenha(senha) {
    if (!senha || String(senha).length < cfg.SENHA_MINIMA) throw Erro('A senha deve ter pelo menos ' + cfg.SENHA_MINIMA + ' caracteres.');
  }
  function novoSal() { return util.uuid().replace(/-/g, ''); }

  function loginLivre(login, ignorarId) {
    return repo().usuarios.umPorIndice('login', login).then(function (u) {
      if (u && u.id !== ignorarId) throw Erro('Já existe um usuário com esse nome de usuário.');
    });
  }

  function admsAtivos(lista, excetoId) {
    return lista.filter(function (u) { return u.perfil === cfg.PERFIS.ADM && u.ativo && u.id !== excetoId; }).length;
  }

  var usuarios = TSI.usuarios = {
    listar: function () {
      return repo().usuarios.listar().then(function (l) {
        return l.sort(function (a, b) { return util.compararNatural(a.nome, b.nome); });
      });
    },

    criar: function (d) {
      var adm = TSI.auth.exigirAdm();
      var v = validar(d, true);
      var login = TSI.auth.chaveLogin(v.usuario);
      return loginLivre(login).then(function () {
        var sal = novoSal();
        var u = {
          id: util.uuid(), nome: v.nome, usuario: v.usuario, login: login, perfil: d.perfil,
          ativo: d.ativo !== false, sal: sal, senhaHash: TSI.auth.hashSenha(d.senha, sal),
          senhaPadrao: false, criadoEm: util.agora(), criadoPor: adm.nome, ultimoAcesso: null
        };
        var ev = H().evento({ entidade: 'usuario', entidadeId: u.id, rotulo: u.nome + ' (' + u.usuario + ')', acao: 'criacao',
          campo: 'Perfil', valorNovo: cfg.ROTULO_PERFIL[u.perfil] });
        return repo().lote([{ colecao: 'usuarios', tipo: 'inserir', valor: u }].concat(H().operacoes([ev])))
          .then(function () { TSI.eventos.emitir('usuarios:alterado'); return u; });
      });
    },

    editar: function (id, d) {
      TSI.auth.exigirAdm();
      var v = validar(d, false);
      var login = TSI.auth.chaveLogin(v.usuario);
      return Promise.all([repo().usuarios.obter(id), repo().usuarios.listar(), loginLivre(login, id)]).then(function (r) {
        var u = r[0], todos = r[1];
        if (!u) throw Erro('Usuário não encontrado.');
        if (u.perfil === cfg.PERFIS.ADM && d.perfil !== cfg.PERFIS.ADM && u.ativo && admsAtivos(todos, u.id) === 0) {
          throw Erro('Este é o único Administrador ativo. Cadastre outro antes de mudar o perfil.');
        }
        var rot = u.nome + ' (' + u.usuario + ')', evs = [];
        function mudou(campo, antes, depois) {
          if (antes !== depois) evs.push(H().evento({ entidade: 'usuario', entidadeId: u.id, rotulo: rot, acao: 'edicao', campo: campo, valorAnterior: antes, valorNovo: depois }));
        }
        mudou('Nome completo', u.nome, v.nome);
        mudou('Nome de usuário', u.usuario, v.usuario);
        mudou('Perfil', cfg.ROTULO_PERFIL[u.perfil], cfg.ROTULO_PERFIL[d.perfil]);
        if (!evs.length) return u;
        u.nome = v.nome; u.usuario = v.usuario; u.login = login; u.perfil = d.perfil;
        return repo().lote([{ colecao: 'usuarios', tipo: 'salvar', valor: u }].concat(H().operacoes(evs))).then(function () {
          TSI.auth.atualizarAtual(u);
          TSI.eventos.emitir('usuarios:alterado');
          return u;
        });
      });
    },

    redefinirSenha: function (id, novaSenha) {
      TSI.auth.exigirAdm();
      validarSenha(novaSenha);
      return repo().usuarios.obter(id).then(function (u) {
        if (!u) throw Erro('Usuário não encontrado.');
        u.sal = novoSal();
        u.senhaHash = TSI.auth.hashSenha(novaSenha, u.sal);
        u.senhaPadrao = false;
        var ev = H().evento({ entidade: 'usuario', entidadeId: u.id, rotulo: u.nome + ' (' + u.usuario + ')', acao: 'senha' });
        return repo().lote([{ colecao: 'usuarios', tipo: 'salvar', valor: u }].concat(H().operacoes([ev])))
          .then(function () { TSI.eventos.emitir('usuarios:alterado'); return u; });
      });
    },

    definirSituacao: function (id, ativo) {
      var adm = TSI.auth.exigirAdm();
      return Promise.all([repo().usuarios.obter(id), repo().usuarios.listar()]).then(function (r) {
        var u = r[0], todos = r[1];
        if (!u) throw Erro('Usuário não encontrado.');
        if (u.ativo === ativo) return u;
        if (!ativo && u.id === adm.id) throw Erro('Você não pode desativar o próprio usuário.');
        if (!ativo && u.perfil === cfg.PERFIS.ADM && admsAtivos(todos, u.id) === 0) {
          throw Erro('Este é o único Administrador ativo e não pode ser desativado.');
        }
        u.ativo = ativo;
        var ev = H().evento({ entidade: 'usuario', entidadeId: u.id, rotulo: u.nome + ' (' + u.usuario + ')',
          acao: ativo ? 'ativacao' : 'desativacao', campo: 'Situação', valorAnterior: ativo ? 'Inativo' : 'Ativo', valorNovo: ativo ? 'Ativo' : 'Inativo' });
        return repo().lote([{ colecao: 'usuarios', tipo: 'salvar', valor: u }].concat(H().operacoes([ev])))
          .then(function () { TSI.eventos.emitir('usuarios:alterado'); return u; });
      });
    },

    /** Cria os usuários iniciais na primeira abertura do banco. */
    semear: function () {
      return repo().usuarios.contar().then(function (n) {
        if (n > 0) return;
        var ops = cfg.USUARIOS_INICIAIS.map(function (d) {
          var sal = novoSal();
          return { colecao: 'usuarios', tipo: 'inserir', valor: {
            id: d.id, nome: d.nome, usuario: d.usuario, login: TSI.auth.chaveLogin(d.usuario), perfil: d.perfil,
            ativo: true, sal: sal, senhaHash: TSI.auth.hashSenha(d.senha, sal), senhaPadrao: true,
            criadoEm: util.agora(), criadoPor: 'Sistema', ultimoAcesso: null
          } };
        });
        return repo().lote(ops);
      });
    },

    /** Acessos iniciais que ainda estão com a senha de fábrica (mostrados na tela de entrada). */
    acessosIniciaisAtivos: function () {
      return repo().usuarios.listar().then(function (l) {
        return cfg.USUARIOS_INICIAIS.filter(function (d) {
          return l.some(function (u) { return u.login === TSI.auth.chaveLogin(d.usuario) && u.senhaPadrao && u.ativo; });
        });
      });
    }
  };
})(window);
