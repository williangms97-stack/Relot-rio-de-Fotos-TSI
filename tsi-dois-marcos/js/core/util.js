/* ==========================================================================
   Utilitários: identificadores, datas, números, texto, hash e eventos
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI = global.TSI || {};
  var util = TSI.util = {};

  /* ---------- Identificadores ---------- */
  util.uuid = function () {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    var b = new Uint8Array(16);
    global.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };

  util.codigoCurto = function (n) {
    var alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var b = new Uint8Array(n || 4);
    global.crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return alfabeto[x % alfabeto.length]; }).join('');
  };

  /* ---------- Datas ---------- */
  function p2(n) { return (n < 10 ? '0' : '') + n; }

  util.agora = function () { return new Date().toISOString(); };

  /** Data local no formato AAAA-MM-DD */
  util.dataLocal = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  };

  /** AAAA-MM-DD -> DD/MM/AAAA (sem conversão de fuso) */
  util.fmtData = function (iso) {
    if (!iso) return '—';
    var s = String(iso).slice(0, 10).split('-');
    return s.length === 3 ? s[2] + '/' + s[1] + '/' + s[0] : String(iso);
  };

  /** Carimbo ISO -> DD/MM/AAAA HH:MM (horário local do aparelho) */
  util.fmtDataHora = function (iso, comSegundos) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' +
      p2(d.getHours()) + ':' + p2(d.getMinutes()) + (comSegundos ? ':' + p2(d.getSeconds()) : '');
  };

  util.fmtHora = function (iso) {
    var d = iso ? new Date(iso) : new Date();
    return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  };

  /** Número serial de data do Excel -> AAAA-MM-DD (aritmética em UTC, sem depender de fuso) */
  util.serialExcelParaData = function (serial, base1904) {
    if (typeof serial !== 'number' || !isFinite(serial)) return null;
    var dias = Math.floor(serial) + (base1904 ? 1462 : 0);
    if (dias < 1 || dias > 2958465) return null;
    var d = new Date(Date.UTC(1899, 11, 30) + dias * 86400000);
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
  };

  /** "20/07/2026", "20-07-26" ou "2026-07-20" -> AAAA-MM-DD (ou null) */
  util.textoParaData = function (texto) {
    var s = String(texto || '').trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return valida(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/))) {
      var ano = +m[3]; if (ano < 100) ano += 2000;
      return valida(ano, +m[2], +m[1]);
    }
    return null;
    function valida(a, me, d) {
      var dt = new Date(Date.UTC(a, me - 1, d));
      if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== me - 1 || dt.getUTCDate() !== d) return null;
      return a + '-' + p2(me) + '-' + p2(d);
    }
  };

  /* ---------- Números ---------- */
  var fmtCache = {};
  util.fmtNum = function (v, casas) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v !== 'number') return String(v);
    var c = casas === undefined ? 2 : casas;
    var f = fmtCache[c] || (fmtCache[c] = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: c }));
    return f.format(v);
  };

  util.fmtPct = function (v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + '%';
  };

  /** Converte "1.234,5", "1234.5" ou número em Number; devolve null quando não é numérico */
  util.paraNumero = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v === null || v === undefined) return null;
    var s = String(v).trim().replace(/\s/g, '');
    if (!s || !/^[+-]?[\d.,]+$/.test(s)) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : null;
  };

  util.fmtBytes = function (b) {
    if (!b && b !== 0) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return util.fmtNum(b / 1024, 0) + ' KB';
    return util.fmtNum(b / 1048576, 1) + ' MB';
  };

  /* ---------- Texto ---------- */
  var MAPA_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  util.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return MAPA_ESC[c]; });
  };

  /** Remove espaços duplicados e das pontas */
  util.limpar = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
  };

  /** Minúsculas, sem acentos, sem pontuação — para comparar rótulos e pesquisar */
  util.chave = function (s) {
    return util.limpar(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  };

  util.contem = function (texto, busca) {
    return util.chave(texto).indexOf(util.chave(busca)) >= 0;
  };

  util.iniciais = function (nome) {
    var p = util.limpar(nome).split(' ').filter(Boolean);
    if (!p.length) return '?';
    return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };

  util.nomeArquivoSeguro = function (s) {
    return util.limpar(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  };

  /** Comparação "natural": 9 < 10, textos em ordem alfabética */
  util.compararNatural = function (a, b) {
    return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
  };

  util.plural = function (n, singular, pluralTxt) {
    return util.fmtNum(n, 0) + ' ' + (n === 1 ? singular : pluralTxt);
  };

  /* ---------- Diversos ---------- */
  util.debounce = function (fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms || 250);
    };
  };

  util.proximoQuadro = function () {
    return new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); });
  };

  util.agrupar = function (lista, fnChave) {
    var mapa = new Map();
    lista.forEach(function (item) {
      var k = fnChave(item);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(item);
    });
    return mapa;
  };

  util.unicos = function (lista) {
    return Array.from(new Set(lista.filter(function (v) { return v !== null && v !== undefined && v !== ''; })))
      .sort(util.compararNatural);
  };

  /* ---------- Carga de bibliotecas sob demanda ---------- */
  var scripts = {};
  util.carregarScript = function (url) {
    if (!scripts[url]) {
      scripts[url] = new Promise(function (ok, falha) {
        var s = document.createElement('script');
        s.src = url;
        s.onload = function () { ok(); };
        s.onerror = function () {
          delete scripts[url];
          s.remove();
          var e = new Error('Não foi possível carregar um componente do sistema. Verifique a conexão e tente novamente.');
          e.amigavel = true;
          falha(e);
        };
        document.head.appendChild(s);
      });
    }
    return scripts[url];
  };

  /** Garante que a biblioteca (lista de arquivos de config.BIBLIOTECAS) esteja carregada. */
  util.exigirBiblioteca = function (nome, jaCarregada) {
    if (jaCarregada()) return Promise.resolve();
    var arquivos = (TSI.config.BIBLIOTECAS[nome] || []).slice();
    return arquivos.reduce(function (cadeia, url) {
      return cadeia.then(function () { return util.carregarScript(url); });
    }, Promise.resolve());
  };

  /* ---------- SHA-256 (JS puro; funciona também fora de contexto seguro) ----------
     Usado apenas para não guardar senhas em texto puro nesta versão demonstrativa.
     Autenticação real deve ser feita no servidor. */
  var K = (function () {
    var k = [], n = 2;
    while (k.length < 64) {
      var primo = true;
      for (var i = 2; i * i <= n; i++) if (n % i === 0) { primo = false; break; }
      if (primo) { var c = Math.cbrt(n); k.push(Math.floor((c - Math.floor(c)) * 4294967296)); }
      n++;
    }
    return k;
  })();

  util.sha256 = function (texto) {
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    var bytes = new TextEncoder().encode(String(texto));
    var l = bytes.length;
    var total = ((l + 9 + 63) >> 6) << 6;
    var m = new Uint8Array(total);
    m.set(bytes); m[l] = 0x80;
    var dv = new DataView(m.buffer);
    dv.setUint32(total - 8, Math.floor((l * 8) / 4294967296));
    dv.setUint32(total - 4, (l * 8) >>> 0);
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Uint32Array(64);
    for (var i = 0; i < total; i += 64) {
      var t;
      for (t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + K[t] + w[t]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    return h.map(function (x) { return ('00000000' + x.toString(16)).slice(-8); }).join('');
  };

  /* ---------- Barramento de eventos ----------
     Avisa as telas quando os dados mudam. O BroadcastChannel repassa o aviso às outras
     abas do mesmo navegador; com um servidor central, o mesmo barramento receberá os
     avisos remotos (ver servicos/sincronizacao.js). */
  var ouvintes = {};
  var canal = null;
  try {
    if ('BroadcastChannel' in global) {
      canal = new BroadcastChannel('tsi-dois-marcos');
      canal.onmessage = function (ev) {
        if (ev.data && ev.data.nome) disparar(ev.data.nome, ev.data.dados);
      };
    }
  } catch (e) { canal = null; }

  function disparar(nome, dados) {
    (ouvintes[nome] || []).slice().forEach(function (fn) {
      try { fn(dados); } catch (e) { console.error('[eventos]', nome, e); }
    });
  }

  TSI.eventos = {
    ouvir: function (nome, fn) {
      (ouvintes[nome] = ouvintes[nome] || []).push(fn);
      return function () { ouvintes[nome] = (ouvintes[nome] || []).filter(function (f) { return f !== fn; }); };
    },
    emitir: function (nome, dados) {
      disparar(nome, dados);
      if (canal) { try { canal.postMessage({ nome: nome, dados: dados || null }); } catch (e) { /* dados não clonáveis */ } }
    }
  };
})(window);
