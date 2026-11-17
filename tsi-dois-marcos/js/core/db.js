/* ==========================================================================
   Acesso ao IndexedDB (banco local do aparelho)
   Somente este arquivo e o repositório local conhecem o IndexedDB.
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI;
  var cfg = TSI.config.BANCO;
  var promessa = null;

  /* Estruturas independentes. Para evoluir o esquema, aumente BANCO.VERSAO e
     acrescente um bloco "if (versaoAnterior < N)" — nunca altere blocos antigos. */
  function migrar(db, versaoAnterior, tx) {
    function criar(nome, opcoes, indices) {
      var s = db.createObjectStore(nome, opcoes);
      (indices || []).forEach(function (i) { s.createIndex(i[0], i[1], i[2] || {}); });
    }
    if (versaoAnterior < 1) {
      criar('usuarios', { keyPath: 'id' }, [['login', 'login', { unique: true }]]);
      criar('maquinas', { keyPath: 'id' });
      // Ordens de tratamento: a ordem de TSI (coluna U do RQ70) é a chave
      criar('ordens', { keyPath: 'ordemTsi' }, [['lote', 'lote'], ['cultivar', 'cultivar']]);
      // Ordens canceladas ou desconsideradas (situação vigente)
      criar('ordens_inativas', { keyPath: 'ordemTsi' });
      criar('importacoes', { keyPath: 'id' }, [['dataHora', 'dataHora']]);
      criar('importacoes_linhas', { keyPath: 'importacaoId' });
      // Registros fotográficos: o índice único impede dois registros principais por ordem
      criar('registros', { keyPath: 'id' }, [
        ['chaveOrdemAtiva', 'chaveOrdemAtiva', { unique: true }],
        ['ordemTsi', 'ordemTsi'],
        ['operadorId', 'operadorId'],
        ['maquinaId', 'maquinaId']
      ]);
      criar('fotos', { keyPath: 'id' }, [['registroId', 'registroId']]);
      criar('historico', { keyPath: 'id' }, [['entidadeChave', 'entidadeChave'], ['dataHora', 'dataHora']]);
      criar('fila_sincronizacao', { keyPath: 'id' }, [['situacao', 'situacao'], ['registroId', 'registroId']]);
      // Registro em andamento do operador (sobrevive ao fechamento do navegador)
      criar('rascunhos', { keyPath: 'usuarioId' });
    }
    if (versaoAnterior < 2) {
      // Versão 1.2: cada linha do RQ70 (lote) passa a ter a própria chave ("ordem|LOTE" ou
      // "SEM|LOTE|data"), porque uma ordem pode ter mais de um lote e há lotes sem ordem.
      // Ordens e ordens inativas são recriadas com a nova chave; registros e rascunhos ganham "chaveOrdem".
      var montar = function (o) { return TSI.ordens.montarChave(o); };
      tx.objectStore('ordens').getAll().onsuccess = function (e1) {
        var ordens = e1.target.result || [], porNumero = {};
        ordens.forEach(function (o) { o.chave = o.chave || montar(o); porNumero[o.ordemTsi] = o.chave; });
        tx.objectStore('ordens_inativas').getAll().onsuccess = function (e2) {
          var inativas = e2.target.result || [];
          db.deleteObjectStore('ordens');
          db.deleteObjectStore('ordens_inativas');
          criar('ordens', { keyPath: 'chave' }, [['lote', 'lote'], ['cultivar', 'cultivar'], ['ordemTsi', 'ordemTsi']]);
          criar('ordens_inativas', { keyPath: 'chave' });
          var so = tx.objectStore('ordens'), si = tx.objectStore('ordens_inativas');
          ordens.forEach(function (o) { if (o.chave) so.put(o); });
          inativas.forEach(function (i) { i.chave = i.chave || porNumero[i.ordemTsi] || ''; if (i.chave) si.put(i); });

          var sr = tx.objectStore('registros');
          if (!sr.indexNames.contains('chaveOrdem')) sr.createIndex('chaveOrdem', 'chaveOrdem');
          sr.getAll().onsuccess = function (e3) {
            (e3.target.result || []).forEach(function (r) {
              if (r.chaveOrdem) return;
              r.chaveOrdem = porNumero[r.ordemTsi] || montar({ ordemTsi: r.ordemTsi, lote: r.ordem && r.ordem.lote });
              if (r.chaveOrdemAtiva === r.ordemTsi) r.chaveOrdemAtiva = r.chaveOrdem;
              sr.put(r);
            });
          };
          var sz = tx.objectStore('rascunhos');
          sz.getAll().onsuccess = function (e4) {
            (e4.target.result || []).forEach(function (z) {
              if (z.chaveOrdem || !z.ordemTsi) return;
              z.chaveOrdem = porNumero[z.ordemTsi] || '';
              sz.put(z);
            });
          };
        };
      };
    }
  }

  function abrir() {
    if (promessa) return promessa;
    promessa = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('Este navegador não oferece armazenamento local (IndexedDB).')); return; }
      var req;
      try { req = global.indexedDB.open(cfg.NOME, cfg.VERSAO); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function (ev) { migrar(req.result, ev.oldVersion, req.transaction); };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { db.close(); promessa = null; };
        resolve(db);
      };
      req.onerror = function () { reject(req.error || new Error('Não foi possível abrir o banco local.')); };
      req.onblocked = function () { reject(new Error('O banco local está em uso por outra aba. Feche as outras abas do sistema e tente de novo.')); };
    });
    promessa.catch(function () { promessa = null; });
    return promessa;
  }

  /** Executa fn(store) dentro de uma transação e resolve quando ela é concluída. */
  function transacao(colecoes, modo, fn) {
    return abrir().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx, resultado;
        try { tx = db.transaction(colecoes, modo); } catch (e) { reject(e); return; }
        tx.oncomplete = function () { resolve(resultado); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Operação cancelada pelo banco local.')); };
        try {
          resultado = fn(function (nome) { return tx.objectStore(nome); }, tx);
        } catch (e) {
          try { tx.abort(); } catch (_) { /* já encerrada */ }
          reject(e);
        }
      });
    });
  }

  /** Uma leitura simples: fn(store) devolve um IDBRequest. */
  function ler(colecao, fn) {
    var req;
    return transacao([colecao], 'readonly', function (store) { req = fn(store(colecao)); })
      .then(function () { return req.result; });
  }

  TSI.db = { abrir: abrir, transacao: transacao, ler: ler };
})(window);
