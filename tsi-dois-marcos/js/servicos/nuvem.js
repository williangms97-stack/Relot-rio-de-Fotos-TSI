/* ==========================================================================
   Ligação com o servidor central (Supabase)
   --------------------------------------------------------------------------
   Ativa somente quando URL e CHAVE_PUBLICA estão preenchidas em js/core/servidor.js.

   Como funciona
   - O banco do aparelho (IndexedDB) continua sendo a fonte das telas: rápido e
     disponível sem internet.
   - Novidades do servidor são baixadas para o aparelho ao entrar, ao voltar a
     conexão e periodicamente (só o que mudou desde a última vez).
   - Registro fotográfico feito no celular: gravado no aparelho e enviado pela
     fila (fotos para o Storage + função tsi_criar_registro). Funciona offline.
   - Operações do administrador (importar RQ70, cancelar, corrigir, máquinas):
     vão direto ao servidor (tsi_lote) e depois são aplicadas no aparelho.
   - Login pelo Supabase Auth; cadastro de usuários pela Edge Function tsi-usuarios.
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var S = TSI.servidor || {};
  var util = TSI.util, cfg = TSI.config;
  var configurado = !!(S.URL && S.CHAVE_PUBLICA);

  TSI.nuvem = { ativa: false, configurado: configurado };
  if (!configurado) return;
  if (!global.supabase || !global.supabase.createClient) {
    console.error('[nuvem] biblioteca do Supabase não carregada (vendor/supabase.js)');
    return;
  }

  var Erro = function (m) { return TSI.auth.Erro(m); };
  var local = TSI.RepositorioLocal;
  var CHAVE_PERFIL = 'tsi.nuvem.perfil';
  var SO_LOCAL = ['filaSincronizacao', 'rascunhos', 'usuarios'];
  var LIMITE_LOTE = 600 * 1024;      // tamanho máximo de cada envio do administrador (bytes de JSON)
  var PAGINA = 500;
  var SOBREPOSICAO_MS = 2 * 60 * 1000;   // revisita os últimos 2 min (gravações que terminaram fora de ordem)

  var sb = global.supabase.createClient(S.URL, S.CHAVE_PUBLICA, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tsi.supabase.sessao' }
  });

  function online() { return global.navigator.onLine !== false; }
  function semConexao(e) {
    var m = (e && (e.message || e.msg)) || '';
    return !online() || /Failed to fetch|NetworkError|Load failed|network|fetch/i.test(m);
  }
  function erroDoServidor(e, padrao) {
    if (semConexao(e)) return Erro('Sem conexão com o servidor. Verifique a internet e tente novamente.');
    var m = (e && e.message) || '';
    if (/permission denied|JWT|not authorized|row-level security/i.test(m)) return Erro('Sem permissão no servidor. Entre novamente.');
    return Erro(m || padrao || 'O servidor recusou a operação.');
  }

  /** Chama uma função tsi_* do banco. */
  function rpc(nome, p) {
    return sb.rpc(nome, { p: p || {} }).then(function (r) {
      if (r.error) throw erroDoServidor(r.error);
      return r.data;
    }, function (e) { throw erroDoServidor(e); });
  }

  function lerPerfil() { try { return JSON.parse(global.localStorage.getItem(CHAVE_PERFIL) || 'null'); } catch (e) { return null; } }
  function gravarPerfil(p) {
    try { if (p) global.localStorage.setItem(CHAVE_PERFIL, JSON.stringify(p)); else global.localStorage.removeItem(CHAVE_PERFIL); } catch (e) { /* sem armazenamento */ }
  }
  function emailDe(login) {
    var l = TSI.auth.chaveLogin(login);
    return l.indexOf('@') >= 0 ? l : l + '@' + S.DOMINIO_LOGIN;
  }

  /* ======================================================================
     Acesso (Supabase Auth)
     ====================================================================== */
  var auth = TSI.auth;
  auth.entrar = function (login, senha, perfilEscolhido) {
    if (!TSI.auth.chaveLogin(login) || !senha) return Promise.reject(Erro('Informe o usuário e a senha.'));
    if (!online()) return Promise.reject(Erro('Sem conexão com a internet. Para entrar é preciso estar conectado; depois o aplicativo funciona sem internet.'));
    return sb.auth.signInWithPassword({ email: emailDe(login), password: String(senha) }).then(function (r) {
      if (r.error) {
        var m = r.error.message || '';
        if (/banned/i.test(m)) throw Erro('Este usuário está inativo. Procure o administrador.');
        if (/invalid login|invalid credentials|invalid_credentials/i.test(m) || r.error.status === 400) throw Erro('Usuário ou senha incorretos.');
        throw erroDoServidor(r.error);
      }
      return rpc('tsi_meu_perfil');
    }).then(function (p) {
      if (!p.ativo) throw Erro('Este usuário está inativo. Procure o administrador.');
      if (perfilEscolhido === cfg.PERFIS.ADM && p.perfil !== cfg.PERFIS.ADM) {
        var e = Erro('Este usuário não tem perfil de Administrador.');
        e.codigo = 'SEM_PERFIL_ADM';
        throw e;
      }
      var anterior = lerPerfil();
      if (anterior && anterior.id !== p.id) limparCursores();   // outro usuário neste aparelho
      gravarPerfil(p);
      var u = auth.assumir(p, perfilEscolhido);
      sincronia.iniciar();
      return u;
    }).catch(function (e) {
      sb.auth.signOut({ scope: 'local' }).catch(function () {});   // não deixa sessão parcial
      throw e;
    });
  };

  auth.restaurar = function () {
    var cache = lerPerfil(), sessao = auth.sessaoGravada();
    if (!cache || !sessao || sessao.usuarioId !== cache.id) return Promise.resolve(null);
    return sb.auth.getSession().catch(function () { return { data: { session: null } }; }).then(function (r) {
      var s = r && r.data && r.data.session;
      if (!s && online()) { gravarPerfil(null); auth.sair(); return null; }   // sessão expirada: entrar de novo
      if (s && s.user && s.user.id !== cache.id) { gravarPerfil(null); auth.sair(); return null; }
      var u = auth.assumir(cache, sessao.modo);   // sem internet: segue com os dados do aparelho
      sincronia.iniciar();
      return u;
    });
  };

  var sairLocal = auth.sair;
  auth.sair = function () {
    sincronia.parar();
    gravarPerfil(null);
    sb.auth.signOut({ scope: 'local' }).catch(function () {});
    sairLocal();
  };

  /** Confere no servidor se o usuário continua ativo (perfil pode ter mudado). */
  function conferirPerfil() {
    return rpc('tsi_meu_perfil').then(function (p) {
      var atual = auth.usuario();
      if (!atual || p.id !== atual.id) return;
      if (!p.ativo) { TSI.eventos.emitir('sessao:encerrada', { motivo: 'Seu usuário foi desativado pelo administrador.' }); return; }
      gravarPerfil(p);
      if (p.nome !== atual.nome || p.perfil !== atual.perfil || p.usuario !== atual.usuario) auth.assumir(p, auth.modo());
    });
  }

  /* ======================================================================
     Usuários (Edge Function tsi-usuarios)
     ====================================================================== */
  function chamarFuncao(corpo) {
    auth.exigirAdm();
    corpo.dominio = S.DOMINIO_LOGIN;
    return sb.functions.invoke(S.FUNCAO_USUARIOS, { body: corpo }).then(function (r) {
      if (!r.error) {
        if (r.data && r.data.erro) throw Erro(r.data.erro);
        return r.data && r.data.usuario;
      }
      var ctx = r.error.context;
      var leitura = ctx && typeof ctx.json === 'function' ? ctx.json().catch(function () { return null; }) : Promise.resolve(null);
      return leitura.then(function (j) {
        if (j && j.erro) throw Erro(j.erro);
        if (semConexao(r.error)) throw Erro('Sem conexão com o servidor. Verifique a internet e tente novamente.');
        throw Erro('Não foi possível falar com a função "' + S.FUNCAO_USUARIOS + '" do Supabase. Confira se ela foi publicada.');
      });
    }, function (e) { throw erroDoServidor(e); }).then(function (u) {
      TSI.eventos.emitir('usuarios:alterado');
      if (u && auth.usuario() && u.id === auth.usuario().id) { gravarPerfil(u); auth.assumir(u, auth.modo()); }
      return u;
    });
  }
  var usuarios = TSI.usuarios;
  usuarios.listar = function () {
    return rpc('tsi_listar_perfis').then(function (l) {
      return (l || []).map(function (p) { return Object.assign({ senhaPadrao: false }, p); });
    });
  };
  usuarios.criar = function (d) { return chamarFuncao({ acao: 'criar', nome: d.nome, usuario: d.usuario, senha: d.senha, perfil: d.perfil, ativo: d.ativo !== false }); };
  usuarios.editar = function (id, d) { return chamarFuncao({ acao: 'editar', id: id, nome: d.nome, usuario: d.usuario, perfil: d.perfil }); };
  usuarios.redefinirSenha = function (id, senha) { return chamarFuncao({ acao: 'senha', id: id, senha: senha }); };
  usuarios.definirSituacao = function (id, ativo) { return chamarFuncao({ acao: 'situacao', id: id, ativo: ativo }); };
  usuarios.semear = function () { return Promise.resolve(); };
  usuarios.acessosIniciaisAtivos = function () { return Promise.resolve([]); };
  TSI.maquinas.semear = function () { return Promise.resolve(); };   // máquinas vêm do servidor

  /* ======================================================================
     Repositório: leitura no aparelho, gravação do ADM no servidor
     ====================================================================== */
  var ORDEM_ENVIO = { ordens: 0, ordensInativas: 1, maquinas: 1, registros: 1, fotos: 1, historico: 2, importacoesLinhas: 3, importacoes: 4 };

  function paraServidor(op) {
    var o = { colecao: op.colecao, tipo: op.tipo };
    if (op.tipo === 'remover') o.chave = op.chave;
    else {
      o.valor = Object.assign({}, op.valor);
      if (op.colecao === 'fotos') delete o.valor.dados;
    }
    return o;
  }

  /** Envia operações do ADM ao servidor, em partes quando forem muitas. */
  function enviarLote(ops) {
    if (!online()) return Promise.reject(Erro('Sem conexão com o servidor. Esta operação do administrador precisa de internet.'));
    var lista = ops.map(paraServidor).map(function (o, i) { return { o: o, i: i, t: JSON.stringify(o).length }; })
      .sort(function (a, b) { return (ORDEM_ENVIO[a.o.colecao] - ORDEM_ENVIO[b.o.colecao]) || (a.i - b.i); });
    var partes = [], atual = [], tam = 0;
    lista.forEach(function (x) {
      if (atual.length && tam + x.t > LIMITE_LOTE) { partes.push(atual); atual = []; tam = 0; }
      atual.push(x.o); tam += x.t;
    });
    if (atual.length) partes.push(atual);
    return partes.reduce(function (cadeia, parte) {
      return cadeia.then(function () { return rpc('tsi_lote', { operacoes: parte }); });
    }, Promise.resolve());
  }

  var repo = Object.create(local);
  repo.tipo = 'supabase';
  repo.local = local;
  repo.lote = function (ops) {
    if (!ops || !ops.length) return Promise.resolve();
    var criacao = ops.some(function (o) { return o.colecao === 'registros' && o.tipo === 'inserir'; });
    var doServidor = ops.filter(function (o) { return SO_LOCAL.indexOf(o.colecao) < 0; });
    if (criacao || !doServidor.length) return local.lote(ops);   // registro novo: vai pela fila
    return enviarLote(doServidor).then(function () {
      var agora = util.agora();
      return local.lote(ops.map(function (o) {
        if (o.colecao === 'filaSincronizacao' && o.valor) {
          return { colecao: o.colecao, tipo: o.tipo, valor: Object.assign({}, o.valor, { situacao: cfg.SITUACAO_ENVIO.SINCRONIZADO, tentativas: 1, ultimaTentativa: agora }) };
        }
        if (o.colecao === 'registros' && o.valor) {
          return { colecao: o.colecao, tipo: o.tipo, valor: Object.assign({}, o.valor, { situacaoEnvio: cfg.SITUACAO_ENVIO.SINCRONIZADO, erroEnvio: null }) };
        }
        return o;
      }));
    });
  };

  /* fotografias: bytes baixados do Storage quando o aparelho ainda não os tem */
  function baixarFoto(f) {
    if (f.dados || !f.caminho) return Promise.resolve(f);
    if (!online()) return Promise.reject(Erro('Esta fotografia ainda não está neste aparelho. Conecte-se à internet para vê-la.'));
    return sb.storage.from(S.BUCKET_FOTOS).download(f.caminho).then(function (r) {
      if (r.error) throw erroDoServidor(r.error, 'Não foi possível baixar a fotografia.');
      return r.data.arrayBuffer();
    }).then(function (buf) {
      var copia = Object.assign({}, f, { dados: buf });
      return local.fotos.salvar(copia).then(function () { return copia; });
    });
  }
  repo.fotos = Object.assign({}, local.fotos, {
    porIndice: function (indice, valor) {
      return local.fotos.porIndice(indice, valor).then(function (l) { return Promise.all(l.map(baixarFoto)); });
    }
  });
  repo.importacoesLinhas = Object.assign({}, local.importacoesLinhas, {
    obter: function (id) {
      return local.importacoesLinhas.obter(id).then(function (doc) {
        return doc || rpc('tsi_linhas_importacao', { importacaoId: id }).then(function (d) {
          return d ? local.importacoesLinhas.salvar(d).then(function () { return d; }) : d;
        });
      });
    }
  });
  TSI.repo = repo;

  /* ======================================================================
     Sincronização
     ====================================================================== */
  var COLECOES_TODOS = ['maquinas', 'ordens', 'ordensInativas', 'registros', 'fotos'];
  var COLECOES_ADM = ['historico', 'importacoes'];
  var EVENTO = { maquinas: 'maquinas:alterado', ordens: 'ordens:alterado', ordensInativas: 'ordens:alterado', importacoes: 'ordens:alterado',
    registros: 'registros:alterado', fotos: 'registros:alterado', historico: 'registros:alterado' };
  var CHAVE_LOCAL = { ordens: 'ordemTsi', ordensInativas: 'ordemTsi' };

  function chaveCursor(colecao) { return 'tsi.cursor.' + (auth.ehAdm() ? 'ADM' : 'OP') + '.' + colecao; }
  function lerCursor(c) { try { return JSON.parse(global.localStorage.getItem(chaveCursor(c)) || 'null'); } catch (e) { return null; } }
  function gravarCursor(c, v) { try { global.localStorage.setItem(chaveCursor(c), JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
  function limparCursores() {
    try {
      Object.keys(global.localStorage).forEach(function (k) { if (k.indexOf('tsi.cursor.') === 0) global.localStorage.removeItem(k); });
    } catch (e) { /* sem armazenamento */ }
  }

  /** Aplica no aparelho as linhas baixadas de uma coleção. */
  function aplicar(colecao, linhas) {
    if (!linhas.length) return Promise.resolve();
    var removidas = linhas.filter(function (l) { return l.removido; });
    var vivas = linhas.filter(function (l) { return !l.removido; }).map(function (l) { return l.dados; });
    var preparo;
    if (colecao === 'fotos') {
      // mantém os bytes que o aparelho já tem
      preparo = Promise.all(vivas.map(function (f) {
        return local.fotos.obter(f.id).then(function (atual) {
          return Object.assign({}, f, { dados: atual && atual.dados ? atual.dados : null });
        });
      }));
    } else if (colecao === 'registros') {
      preparo = Promise.all(vivas.map(function (r) {
        return Promise.all([local.registros.obter(r.id), local.registros.umPorIndice('chaveOrdemAtiva', r.chaveOrdemAtiva)]).then(function (x) {
          var mesmo = x[0], ocupante = x[1], extras = [];
          var doc = Object.assign({}, r, { situacaoEnvio: cfg.SITUACAO_ENVIO.SINCRONIZADO, erroEnvio: null });
          if (!doc.miniatura && mesmo && mesmo.miniatura) doc.miniatura = mesmo.miniatura;
          if (ocupante && ocupante.id !== r.id) {
            // outro registro deste aparelho ocupa a mesma ordem
            if (ocupante.situacaoEnvio !== cfg.SITUACAO_ENVIO.SINCRONIZADO) {
              extras.push(Object.assign({}, ocupante, { chaveOrdemAtiva: 'conflito:' + ocupante.id, situacaoEnvio: cfg.SITUACAO_ENVIO.FALHA,
                erroEnvio: 'A ordem ' + r.ordemTsi + ' já foi registrada em outro aparelho por ' + (r.operadorNome || 'outro operador') + '.' }));
            } else {
              extras.push(Object.assign({}, ocupante, { chaveOrdemAtiva: 'substituido:' + ocupante.id }));
            }
          }
          return extras.concat([doc]);
        });
      })).then(function (l) { return [].concat.apply([], l); });
    } else {
      preparo = Promise.resolve(vivas);
    }
    return preparo.then(function (docs) {
      var ops = docs.map(function (d) { return { colecao: colecao, tipo: 'salvar', valor: d }; });
      // registros em conflito vêm antes, para liberar a chave única
      ops.sort(function (a, b) { return (/^(conflito|substituido):/.test(b.valor.chaveOrdemAtiva || '') ? 1 : 0) - (/^(conflito|substituido):/.test(a.valor.chaveOrdemAtiva || '') ? 1 : 0); });
      removidas.forEach(function (l) { ops.push({ colecao: colecao, tipo: 'remover', chave: l.id }); });
      return local.lote(ops);
    }).then(function () {
      if (colecao !== 'registros') return;
      // fila: itens de registros em conflito passam a "falha"
      return local.filaSincronizacao.listar().then(function (fila) {
        var falhas = vivas.map(function (r) { return r.chaveOrdemAtiva; });
        var ops = [];
        return Promise.all(fila.filter(function (i) { return i.situacao !== cfg.SITUACAO_ENVIO.SINCRONIZADO; }).map(function (i) {
          return local.registros.obter(i.registroId).then(function (reg) {
            if (reg && reg.situacaoEnvio === cfg.SITUACAO_ENVIO.FALHA && /^conflito:/.test(reg.chaveOrdemAtiva || '') && falhas.indexOf(reg.ordemTsi) >= 0) {
              ops.push({ colecao: 'filaSincronizacao', tipo: 'salvar', valor: Object.assign({}, i, { situacao: cfg.SITUACAO_ENVIO.FALHA, erro: reg.erroEnvio }) });
            }
          });
        })).then(function () { return local.lote(ops); });
      });
    });
  }

  function puxarColecao(colecao) {
    var cursor = lerCursor(colecao);
    var desde = cursor ? new Date(new Date(cursor.desde).getTime() - SOBREPOSICAO_MS).toISOString() : null;
    var depoisId = '', recebidas = 0, ultimo = cursor;
    function pagina() {
      return rpc('tsi_puxar', { colecao: colecao, desde: desde, depoisId: depoisId, limite: PAGINA }).then(function (r) {
        var linhas = (r && r.linhas) || [];
        return aplicar(colecao, linhas).then(function () {
          recebidas += linhas.length;
          if (linhas.length) {
            var u = linhas[linhas.length - 1];
            desde = u.atualizadoEm; depoisId = u.id;
            if (!ultimo || u.atualizadoEm >= ultimo.desde) ultimo = { desde: u.atualizadoEm };
          }
          if (linhas.length === PAGINA) return pagina();
        });
      });
    }
    return pagina().then(function () {
      if (ultimo) gravarCursor(colecao, ultimo);
      return recebidas;
    });
  }

  var emAndamento = null, timer = null, ativa = false, ultimaSincronia = null;
  var sincronia = {
    puxar: function () {
      if (emAndamento) return emAndamento;
      if (!auth.usuario() || !online()) return Promise.resolve({ ok: false });
      var colecoes = COLECOES_TODOS.concat(auth.ehAdm() ? COLECOES_ADM : []);
      var avisar = {};
      emAndamento = colecoes.reduce(function (cadeia, c) {
        return cadeia.then(function () {
          return puxarColecao(c).then(function (n) { if (n) avisar[EVENTO[c]] = true; });
        });
      }, Promise.resolve()).then(function () {
        ultimaSincronia = util.agora();
        Object.keys(avisar).forEach(function (ev) { TSI.eventos.emitir(ev, { origem: 'servidor' }); });
        TSI.eventos.emitir('sincronia:concluida', { quando: ultimaSincronia });
        return { ok: true };
      }).then(function (r) { emAndamento = null; return r; }, function (e) {
        emAndamento = null;
        console.warn('[sincronia]', e && e.message);
        TSI.eventos.emitir('sincronia:falha', { mensagem: e && e.message });
        return { ok: false, erro: e };
      });
      return emAndamento;
    },
    ciclo: function () {
      if (!auth.usuario() || !online()) return Promise.resolve();
      return sincronia.puxar().then(function () {
        return TSI.sincronizacao.processar().catch(function (e) { console.warn('[fila]', e && e.message); });
      }).then(function () { return conferirPerfil().catch(function () {}); });
    },
    iniciar: function () {
      if (ativa) { sincronia.ciclo(); return; }
      ativa = true;
      sincronia.ciclo();
      timer = setInterval(function () {
        if (document.visibilityState !== 'hidden') sincronia.ciclo();
      }, Math.max(15, S.INTERVALO_SINCRONIA || 60) * 1000);
    },
    parar: function () { ativa = false; if (timer) clearInterval(timer); timer = null; },
    ultima: function () { return ultimaSincronia; }
  };
  global.addEventListener('online', function () { if (ativa) sincronia.ciclo(); });
  document.addEventListener('visibilitychange', function () { if (ativa && document.visibilityState === 'visible') sincronia.ciclo(); });

  /* ======================================================================
     Envio dos registros da fila
     ====================================================================== */
  TSI.sincronizacao.registrarAdaptador({
    podeEnviar: function (item, reg) {
      var u = auth.usuario();
      // registro em conflito (ordem já registrada em outro aparelho) não é reenviado
      return !!u && reg.operadorId === u.id && !/^conflito:/.test(reg.chaveOrdemAtiva || '');
    },
    enviarRegistro: function (reg, fotos, item) {
      if (item.operacao !== 'criar') return Promise.resolve();   // correções do ADM já vão direto ao servidor
      var metas = [];
      return fotos.reduce(function (cadeia, f) {
        return cadeia.then(function () {
          var caminho = f.caminho || ('registros/' + reg.id + '/' + f.id + '.jpg');
          var envio = f.dados
            ? sb.storage.from(S.BUCKET_FOTOS).upload(caminho, f.dados, { upsert: true, contentType: f.tipo || 'image/jpeg' })
            : Promise.resolve({});
          return envio.then(function (r) {
            if (r && r.error) throw erroDoServidor(r.error, 'Falha ao enviar a fotografia.');
            var meta = Object.assign({}, f, { caminho: caminho });
            delete meta.dados;
            metas.push(meta);
            if (!f.caminho) return local.fotos.salvar(Object.assign({}, f, { caminho: caminho }));
          }, function (e) { throw erroDoServidor(e); });
        });
      }, Promise.resolve()).then(function () {
        return local.historico.porIndice('entidadeChave', 'registro:' + reg.id);
      }).then(function (eventos) {
        var criacao = eventos.filter(function (e) { return e.acao === 'criacao'; })[0] || null;
        var r = Object.assign({}, reg);
        delete r.situacaoEnvio; delete r.erroEnvio;
        return rpc('tsi_criar_registro', { registro: r, fotos: metas, evento: criacao });
      });
    }
  });

  /* antes de comparar a planilha, traz a base atualizada do servidor */
  var analisarLocal = TSI.importacao.analisar;
  TSI.importacao.analisar = function (leitura, cultura) {
    return sincronia.puxar().then(function () { return analisarLocal(leitura, cultura); });
  };

  TSI.nuvem = {
    ativa: true,
    configurado: true,
    cliente: sb,
    sincronia: sincronia,
    rpc: rpc,
    online: online,
    url: S.URL
  };
})(window);
