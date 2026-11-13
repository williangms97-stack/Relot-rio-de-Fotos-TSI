/* ==========================================================================
   Inicialização e troca entre as três interfaces:
   acesso (login) · app do operador (celular) · painel do administrador (desktop)
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, config: cfg } = TSI;
  const { html, icone } = ui;
  const PERFIS = cfg.PERFIS;
  let desmontar = null;

  const raiz = () => document.getElementById('app');

  function trocar(montar) {
    if (desmontar) { try { desmontar(); } catch (e) { console.error(e); } desmontar = null; }
    const r = raiz();
    r.innerHTML = '';
    global.scrollTo(0, 0);
    desmontar = montar(r) || null;
  }

  function sair() {
    TSI.auth.sair();
    try { if (global.location.hash) global.location.hash = ''; } catch (e) { /* endereço não disponível */ }
    rotear();
  }

  /** Mostra a interface que corresponde à sessão atual. */
  function rotear() {
    if (!TSI.auth.usuario()) {
      document.body.dataset.interface = 'acesso';
      trocar((r) => TSI.telas.login.montar(r, rotear));
      return;
    }
    if (TSI.auth.modo() === PERFIS.ADM && TSI.auth.ehAdm()) {
      document.body.dataset.interface = 'painel';
      trocar((r) => TSI.telas.adm.estrutura.montar(r, {
        aoSair: sair,
        aoAbrirOperador: () => { TSI.auth.definirModo(PERFIS.OPERADOR); rotear(); }
      }));
    } else {
      document.body.dataset.interface = 'operador';
      trocar((r) => TSI.telas.operador.montar(r, {
        aoSair: sair,
        aoIrParaPainel: () => { TSI.auth.definirModo(PERFIS.ADM); rotear(); }
      }));
    }
  }

  function erroFatal(e) {
    console.error(e);
    raiz().innerHTML = html`
      <main class="erro-fatal">
        <span class="vazio-icone">${icone('banco', 30)}</span>
        <h1>Não foi possível abrir o armazenamento deste navegador</h1>
        <p>O sistema guarda ordens, registros e fotografias no próprio aparelho. Isso costuma falhar em janela anônima ou quando o armazenamento de sites está bloqueado.</p>
        <p class="texto-menor">${(e && e.message) || 'Erro desconhecido'}</p>
        <button type="button" class="btn btn-primario" id="erro-tentar">Tentar novamente</button>
      </main>`;
    raiz().querySelector('#erro-tentar').addEventListener('click', () => TSI.app.iniciar());
  }

  /** Pede ao navegador para não descartar os dados locais quando faltar espaço. */
  function pedirArmazenamentoPersistente() {
    try {
      if (global.navigator.storage && global.navigator.storage.persist) global.navigator.storage.persist().catch(() => {});
    } catch (e) { /* recurso opcional */ }
  }

  /** PWA: funciona sem internet e pode ser instalado na tela inicial (exige http/https). */
  function registrarServiceWorker() {
    if (!('serviceWorker' in global.navigator) || !/^https?:$/.test(global.location.protocol) || global.claude) return;
    global.navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        if (!novo) return;
        novo.addEventListener('statechange', () => {
          if (novo.state === 'installed' && global.navigator.serviceWorker.controller) {
            ui.aviso('Nova versão do sistema baixada. Feche e abra novamente para atualizar.', 'info', 8000);
          }
        });
      });
    }).catch((e) => console.warn('[PWA] service worker não registrado:', e && e.message));
  }

  TSI.app = {
    rotear: rotear,
    iniciar() {
      return TSI.repo.iniciar()
        .then(() => Promise.all([TSI.usuarios.semear(), TSI.maquinas.semear()]))
        .then(() => TSI.auth.restaurar())
        .then(() => {
          rotear();
          pedirArmazenamentoPersistente();
        })
        .catch(erroFatal);
    }
  };

  function ligar() {
    TSI.sincronizacao.iniciar();
    registrarServiceWorker();
    TSI.app.iniciar();
  }
  // começa assim que o elemento #app existir, sem esperar o restante da página
  if (document.getElementById('app')) ligar();
  else document.addEventListener('DOMContentLoaded', ligar);
})(window);
