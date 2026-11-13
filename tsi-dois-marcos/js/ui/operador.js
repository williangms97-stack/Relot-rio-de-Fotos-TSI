/* ==========================================================================
   App do operador (celular) — registro fotográfico de TSI em 5 etapas
   1 ordem · 2 quantidade · 3 máquina · 4 fotografia · 5 confirmação
   O andamento é salvo a cada etapa (rascunho): se o navegador fechar ao abrir
   a câmera, o operador retoma de onde parou.
   ========================================================================== */
(function (global) {
  'use strict';
  const TSI = global.TSI;
  const { ui, util, config: cfg } = TSI;
  const { html, icone } = ui;
  const SIT = cfg.SITUACAO_ORDEM;

  const ETAPAS = [
    { id: 'ordem', titulo: 'Conferir a ordem' },
    { id: 'quantidade', titulo: 'Quantidade tratada' },
    { id: 'maquina', titulo: 'Máquina utilizada' },
    { id: 'foto', titulo: 'Fotografia da amostra' },
    { id: 'resumo', titulo: 'Confirmar o registro' }
  ];
  const TITULOS = { inicio: 'Registro de TSI', meus: 'Meus registros', detalhe: 'Registro enviado', sucesso: 'Registro salvo' };
  const marcado = (v) => (v ? ui.bruto('checked') : '');

  TSI.telas.operador = {
    montar(raiz, ctx) {
      const usuario = TSI.auth.usuario();
      const urls = ui.GerenteUrls();
      let E = novoEstado();
      let desligarEventos = [];

      function novoEstado() {
        return { tela: 'inicio', origemDetalhe: 'inicio', busca: '', resultado: null, ordem: null, qtd: '', motivo: '', descricao: '',
          maquinaId: '', maquinas: [], fotos: [], captura: null, alvo: 'principal', meus: [], rascunho: null, registro: null, detalhe: null };
      }

      /* ---------- Rascunho ---------- */
      function salvarRascunho() {
        if (!E.ordem) return Promise.resolve();
        return TSI.registros.salvarRascunho({
          usuarioId: usuario.id, ordemTsi: E.ordem.ordemTsi, etapa: E.tela, qtd: E.qtd, motivo: E.motivo, descricao: E.descricao, maquinaId: E.maquinaId,
          fotos: E.fotos.map((f) => ({ dados: f.dados, tipo: f.tipo, largura: f.largura, altura: f.altura, tamanho: f.tamanho,
            miniatura: f.miniatura, capturadaEm: f.capturadaEm, verificacao: f.verificacao }))
        }).catch((e) => console.error('[rascunho]', e));
      }
      function limparFluxo() {
        E.fotos.forEach((f) => f.url && URL.revokeObjectURL(f.url));
        if (E.captura && E.captura.url) URL.revokeObjectURL(E.captura.url);
        const novo = novoEstado();
        novo.meus = E.meus;
        novo.totalOrdens = E.totalOrdens;
        E = novo;
      }
      function comUrl(f) { f.url = URL.createObjectURL(new Blob([f.dados], { type: f.tipo || 'image/jpeg' })); return f; }

      /* ---------- Carga e navegação ---------- */
      function carregarInicio() {
        return Promise.all([TSI.registros.listarDoOperador(usuario.id), TSI.registros.obterRascunho(usuario.id), TSI.ordens.contar()]).then((r) => {
          E.meus = r[0];
          E.rascunho = r[1] || null;
          E.totalOrdens = r[2];
        });
      }
      function ir(tela, semRolagem) {
        E.tela = tela;
        desenhar();
        if (!semRolagem) global.scrollTo(0, 0);
        if (tela !== 'ordem' && ETAPAS.some((e) => e.id === tela)) salvarRascunho();   // o rascunho nasce quando a ordem é confirmada
      }
      function irInicio() {
        limparFluxo();
        return carregarInicio().then(() => ir('inicio'));
      }

      function pesquisar(numero) {
        E.busca = util.limpar(numero);
        if (!E.busca) { E.resultado = { tipo: 'vazio' }; desenharResultado(); return Promise.resolve(); }
        return TSI.ordens.consultar(E.busca).then((c) => {
          if (!c.ordem) { E.resultado = { tipo: 'nao_encontrada', numero: c.numero }; desenharResultado(); return; }
          if (c.situacao !== SIT.PENDENTE) { E.resultado = { tipo: 'bloqueada', consulta: c }; desenharResultado(); return; }
          if (E.rascunho && E.rascunho.ordemTsi === c.ordem.ordemTsi) return retomarRascunho();
          E.resultado = null;
          E.ordem = c.ordem;
          E.qtd = ''; E.motivo = ''; E.descricao = ''; E.maquinaId = ''; E.fotos = [];
          ir('ordem');
        });
      }

      function retomarRascunho() {
        const r = E.rascunho;
        if (!r) return Promise.resolve();
        return TSI.ordens.consultar(r.ordemTsi).then((c) => {
          if (!c.ordem || c.situacao !== SIT.PENDENTE) {
            return TSI.registros.descartarRascunho(usuario.id).then(() => {
              E.rascunho = null;
              ui.aviso('O registro em andamento foi descartado: a ordem ' + r.ordemTsi + ' não está mais pendente.', 'alerta');
              desenhar();
            });
          }
          E.ordem = c.ordem; E.qtd = r.qtd || ''; E.motivo = r.motivo || ''; E.descricao = r.descricao || '';
          E.maquinaId = r.maquinaId || ''; E.fotos = (r.fotos || []).map(comUrl); E.resultado = null;
          const etapa = ETAPAS.some((e) => e.id === r.etapa) ? r.etapa : 'ordem';
          return (etapa === 'maquina' || etapa === 'foto' || etapa === 'resumo' ? carregarMaquinas() : Promise.resolve()).then(() => {
            if (etapa === 'resumo' && (!E.fotos.length || !maquinaAtual())) return ir(E.fotos.length ? 'maquina' : 'foto');
            ir(etapa);
          });
        });
      }

      function carregarMaquinas() {
        return TSI.maquinas.listarAtivas().then((l) => {
          E.maquinas = l;
          if (E.maquinaId && !l.some((m) => m.id === E.maquinaId)) E.maquinaId = '';
        });
      }
      function maquinaAtual() { return E.maquinas.filter((m) => m.id === E.maquinaId)[0] || null; }

      /* ---------- Desenho ---------- */
      function desenhar() {
        const idx = ETAPAS.findIndex((e) => e.id === E.tela);
        raiz.innerHTML = html`
          <div class="op">
            <header class="op-topo">
              <div class="op-topo-linha">
                ${E.tela === 'inicio'
                  ? html`<img class="op-logo" src="${TSI.recursos.logo}" alt="Dois Marcos Sementes" width="${TSI.recursos.logoLargura}" height="${TSI.recursos.logoAltura}">`
                  : E.tela === 'sucesso' ? html`<span class="op-topo-espaco"></span>`
                  : html`<button type="button" class="btn-icone op-topo-botao" data-acao="voltar" aria-label="Voltar">${icone('voltar', 26)}</button>`}
                <div class="op-topo-titulo">
                  ${idx >= 0 ? html`<span>Etapa ${idx + 1} de ${ETAPAS.length}</span><strong>${ETAPAS[idx].titulo}</strong>` : html`<strong>${TITULOS[E.tela] || ''}</strong>`}
                </div>
                <span class="op-offline" id="op-offline" ${TSI.sincronizacao.online() ? ui.bruto('hidden') : ''}>${icone('semRede', 16)}Sem conexão</span>
                <button type="button" class="op-topo-usuario" data-acao="menu" aria-label="Menu de ${usuario.nome}"><span class="avatar">${util.iniciais(usuario.nome)}</span></button>
              </div>
              ${idx >= 0 ? html`<div class="op-progresso" role="progressbar" aria-label="Andamento do registro" aria-valuemin="1" aria-valuemax="${ETAPAS.length}" aria-valuenow="${idx + 1}">
                ${ETAPAS.map((e, i) => html`<span class="${i < idx ? 'feita' : i === idx ? 'atual' : ''}"></span>`)}</div>` : ''}
            </header>
            <main class="op-conteudo">${corpo()}</main>
            ${barra()}
            <input type="file" id="op-foto-entrada" class="so-leitor" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true">
          </div>`;
        if (E.tela === 'quantidade') atualizarDivergencia();
      }

      function corpo() {
        switch (E.tela) {
          case 'inicio': return telaInicio();
          case 'ordem': return telaOrdem();
          case 'quantidade': return telaQuantidade();
          case 'maquina': return telaMaquina();
          case 'foto': return telaFoto();
          case 'resumo': return telaResumo();
          case 'sucesso': return telaSucesso();
          case 'meus': return telaMeus();
          case 'detalhe': return telaDetalhe();
          default: return '';
        }
      }

      function barra() {
        const b = (conteudo) => html`<div class="op-barra"><div class="op-barra-interna">${conteudo}</div></div>`;
        switch (E.tela) {
          case 'ordem': return b(html`
            <button type="button" class="btn btn-secundario btn-g" data-acao="outra-ordem">Outra ordem</button>
            <button type="button" class="btn btn-primario btn-g btn-cresce" data-acao="confirmar-ordem">${icone('check', 22)}<span>Confirmar ordem</span></button>`);
          case 'quantidade': return b(html`<button type="button" class="btn btn-primario btn-g btn-cresce" data-acao="avancar-quantidade"><span>Continuar</span>${icone('avancar', 22)}</button>`);
          case 'maquina': return E.maquinas.length ? b(html`<button type="button" class="btn btn-primario btn-g btn-cresce" data-acao="avancar-maquina"><span>Continuar</span>${icone('avancar', 22)}</button>`) : '';
          case 'foto': return E.captura ? '' : b(html`<button type="button" class="btn btn-primario btn-g btn-cresce" data-acao="avancar-foto" ${E.fotos.length ? '' : ui.bruto('disabled')}><span>Continuar</span>${icone('avancar', 22)}</button>`);
          case 'resumo': return b(html`<button type="button" class="btn btn-acento btn-g btn-cresce" id="op-enviar" data-acao="enviar">${icone('check', 22)}<span>CONFIRMAR E ENVIAR REGISTRO</span></button>`);
          default: return '';
        }
      }

      /* ---------- Início ---------- */
      function telaInicio() {
        return html`
          <section class="cartao op-busca">
            <form id="op-form-busca" novalidate>
              <label for="op-ordem" class="op-rotulo-g">Digite a ordem de tratamento</label>
              <div class="op-busca-linha">
                <input id="op-ordem" name="ordem" type="text" inputmode="numeric" autocomplete="off" enterkeyhint="search" placeholder="Número da ordem de TSI" value="${E.busca}">
                <button type="submit" class="btn btn-primario btn-g" id="op-pesquisar">${icone('buscar', 22)}<span>Pesquisar</span></button>
              </div>
            </form>
            <div id="op-resultado" aria-live="polite">${resultadoBusca()}</div>
            ${E.totalOrdens === 0 ? html`<div class="alerta alerta-info">${icone('info', 20)}<div><strong>Nenhuma ordem disponível neste aparelho.</strong>
              <p>O administrador precisa importar a planilha RQ70 para liberar as ordens de tratamento.</p></div></div>` : ''}
          </section>

          ${E.rascunho ? html`
            <section class="cartao op-rascunho">
              <div>
                <h2>${icone('relogio', 20)}Registro em andamento</h2>
                <p>Ordem <strong>${E.rascunho.ordemTsi}</strong> · parou em “${(ETAPAS.filter((e) => e.id === E.rascunho.etapa)[0] || ETAPAS[0]).titulo}” · ${util.fmtDataHora(E.rascunho.atualizadoEm)}</p>
              </div>
              <div class="op-rascunho-acoes">
                <button type="button" class="btn btn-primario" data-acao="retomar">Continuar</button>
                <button type="button" class="btn btn-fantasma" data-acao="descartar-rascunho">Descartar</button>
              </div>
            </section>` : ''}

          <section class="op-secao">
            <div class="op-secao-topo">
              <h2>Meus registros</h2>
              ${E.meus.length > 3 ? html`<button type="button" class="btn btn-fantasma btn-p" data-acao="ver-meus">Ver todos (${E.meus.length})</button>` : ''}
            </div>
            ${E.meus.length ? html`<ul class="op-lista">${E.meus.slice(0, 3).map(itemRegistro)}</ul>`
              : ui.vazio('camera', 'Nenhum registro enviado', 'Pesquise uma ordem de tratamento para fazer o primeiro registro fotográfico.')}
          </section>

          ${TSI.nuvem && TSI.nuvem.ativa
            ? html`<p class="op-nota">${icone('nuvem', 16)}<span>Os registros ficam guardados neste aparelho e são enviados ao servidor assim que houver internet.</span></p>`
            : html`<p class="op-nota">${icone('banco', 16)}<span>Os registros ficam guardados neste aparelho como “Aguardando envio”. O envio ao servidor central será ativado na próxima etapa do projeto.</span></p>`}`;
      }

      function resultadoBusca() {
        const r = E.resultado;
        if (!r) return '';
        if (r.tipo === 'vazio') return html`<p class="alerta alerta-erro">${icone('alerta', 20)}<span>Digite o número da ordem de tratamento.</span></p>`;
        if (r.tipo === 'nao_encontrada') return html`
          <div class="alerta alerta-erro">${icone('alerta', 20)}
            <div><strong>Ordem ${r.numero} não localizada.</strong>
            <p>Confira o número digitado. Se estiver correto, peça ao administrador para importar a planilha RQ70 atualizada.</p></div>
          </div>`;
        const c = r.consulta, o = c.ordem;
        if (c.situacao === SIT.REGISTRADA) {
          const reg = c.registro, meu = reg.operadorId === usuario.id;
          return html`
            <div class="alerta alerta-alerta op-bloqueio">${icone('cadeado', 20)}
              <div>
                <strong>A ordem ${o.ordemTsi} já possui registro fotográfico.</strong>
                <p>Não é possível fazer um novo registro para esta ordem.</p>
                <div class="op-bloqueio-dados">
                  ${reg.miniatura ? html`<img src="${reg.miniatura}" alt="Fotografia registrada da amostra">` : ''}
                  ${ui.dados([['Registrado por', reg.operadorNome], ['Data e horário', util.fmtDataHora(reg.criadoEm)], ['Máquina', reg.maquinaNome],
                    ['Quantidade tratada', TSI.ordens.fmtQtd(reg.qtdEfetiva, reg.ordem)], ['Lote', o.lote], { rotulo: 'Protocolo', valor: reg.protocolo, largo: true }])}
                </div>
                ${meu ? html`<button type="button" class="btn btn-secundario" data-acao="abrir-registro" data-id="${reg.id}">Ver meu registro</button>` : ''}
              </div>
            </div>`;
        }
        const i = c.inativacao;
        return html`
          <div class="alerta alerta-neutro">${icone('anular', 20)}
            <div>
              <strong>A ordem ${o.ordemTsi} foi ${cfg.ROTULO_SITUACAO_ORDEM[c.situacao].toLowerCase()} pelo administrador.</strong>
              <p>Esta ordem não aceita registro fotográfico.</p>
              ${ui.dados([['Responsável', i.usuarioNome], ['Data e horário', util.fmtDataHora(i.dataHora)], { rotulo: 'Motivo', valor: i.motivo, largo: true }])}
            </div>
          </div>`;
      }
      function desenharResultado() {
        const alvo = raiz.querySelector('#op-resultado');
        if (alvo) alvo.innerHTML = resultadoBusca();
      }

      function itemRegistro(r) {
        const o = r.ordem || {};
        return html`
          <li>
            <button type="button" class="op-item" data-acao="abrir-registro" data-id="${r.id}">
              ${r.miniatura ? html`<img src="${r.miniatura}" alt="" loading="lazy">` : html`<span class="op-item-semfoto">${icone('imagem', 22)}</span>`}
              <span class="op-item-texto">
                <strong>Ordem ${r.ordemTsi}</strong>
                <span>${o.lote || '—'} · ${o.cultivar || '—'}</span>
                <span>${util.fmtDataHora(r.criadoEm)} · ${r.maquinaNome}</span>
                <span class="op-item-selo">${r.anulado ? ui.seloSimples('Anulado', 'selo-cancelada', 'anular') : ui.seloEnvio(r.situacaoEnvio)}</span>
              </span>
              <span class="op-item-seta">${icone('avancar', 20)}</span>
            </button>
          </li>`;
      }

      /* ---------- Etapa 1: ordem ---------- */
      function telaOrdem() {
        const o = E.ordem;
        return html`
          <section class="cartao op-ordem">
            <div class="op-ordem-topo">
              <div><span>Ordem de TSI</span><strong>${o.ordemTsi}</strong></div>
              ${ui.seloOrdem(SIT.PENDENTE)}
            </div>
            ${ui.dados(ui.paresDaOrdem(o), 'dados-2col')}
          </section>
          <p class="op-ajuda">Confira os dados acima com a ordem física antes de confirmar.</p>`;
      }

      /* ---------- Etapa 2: quantidade ---------- */
      function telaQuantidade() {
        const o = E.ordem, prevista = TSI.ordens.qtdPrevista(o), un = TSI.ordens.unidade(o);
        const dica = o.classeEmbalagem === 'BIG_BAG' ? 'Confirme a quantidade prevista ou corrija para o que foi realmente tratado.'
          : o.classeEmbalagem === 'SACARIA' ? 'Informe a quantidade realmente tratada. Em sacaria, o total pode ser diferente do previsto.'
          : 'Informe a quantidade realmente tratada.';
        return html`
          <section class="cartao op-prevista">
            <span>Quantidade prevista no RQ70</span>
            <strong>${prevista === null ? 'Não informada' : html`${util.fmtNum(prevista, 2)} <small>${prevista === 1 ? un.singular : un.plural}</small>`}</strong>
            <span class="texto-menor">${typeof o.pesoEmbTsi === 'number' ? util.fmtNum(o.pesoEmbTsi, 2) + ' kg por embalagem · ' : ''}${o.tipoEmbalagem || 'Embalagem não informada'}</span>
          </section>

          <section class="cartao">
            <label for="op-qtd" class="op-rotulo-g">Quantidade efetivamente tratada</label>
            <div class="op-contador">
              <button type="button" class="op-contador-botao" data-acao="qtd-menos" aria-label="Diminuir uma unidade">${icone('menos', 26)}</button>
              <input id="op-qtd" type="text" inputmode="decimal" autocomplete="off" value="${E.qtd}" aria-describedby="op-qtd-dica">
              <button type="button" class="op-contador-botao" data-acao="qtd-mais" aria-label="Aumentar uma unidade">${icone('mais', 26)}</button>
            </div>
            <p class="op-ajuda" id="op-qtd-dica">${dica}</p>
          </section>

          <section class="cartao op-divergencia" id="op-divergencia" hidden>
            <h2>${icone('alerta', 22)}<span id="op-div-texto"></span></h2>
            <p>A quantidade é diferente da prevista. Informe o motivo para continuar.</p>
            <fieldset class="op-opcoes">
              <legend>Motivo da divergência</legend>
              ${cfg.MOTIVOS_DIVERGENCIA.map((m, i) => html`
                <label class="opcao"><input type="radio" name="motivo" id="op-motivo-${i}" value="${m}" ${marcado(E.motivo === m)}><span>${m}</span></label>`)}
            </fieldset>
            <div class="campo">
              <label for="op-descricao">Descrição complementar <span class="opcional" id="op-desc-regra">(opcional)</span></label>
              <textarea id="op-descricao" rows="3" maxlength="300" placeholder="Detalhe o que aconteceu">${E.descricao}</textarea>
            </div>
          </section>
          <p class="form-erro" id="op-erro" role="alert" hidden></p>`;
      }
      function atualizarDivergencia() {
        const painel = raiz.querySelector('#op-divergencia');
        if (!painel) return;
        const prevista = TSI.ordens.qtdPrevista(E.ordem), n = util.paraNumero(E.qtd), un = TSI.ordens.unidade(E.ordem);
        const diverge = n !== null && n >= 0 && TSI.registros.haDivergencia(prevista, n);
        painel.hidden = !diverge;
        if (diverge) {
          const dif = Math.round((n - prevista) * 100) / 100, abs = Math.abs(dif);
          raiz.querySelector('#op-div-texto').textContent = (dif > 0 ? '+' : '−') + util.fmtNum(abs, 2) + ' ' + (abs === 1 ? un.singular : un.plural) + ' em relação ao previsto';
        }
        const regra = raiz.querySelector('#op-desc-regra');
        if (regra) regra.textContent = E.motivo === cfg.MOTIVO_EXIGE_DESCRICAO ? '(obrigatória)' : '(opcional)';
      }
      function erroEtapa(mensagem) {
        const er = raiz.querySelector('#op-erro');
        if (!er) { ui.aviso(mensagem, 'erro'); return; }
        er.textContent = mensagem; er.hidden = !mensagem;
        if (mensagem) er.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }

      /* ---------- Etapa 3: máquina ---------- */
      function telaMaquina() {
        if (!E.maquinas.length) return ui.vazio('maquina', 'Nenhuma máquina ativa', 'Peça ao administrador para cadastrar ou ativar uma máquina antes de continuar.');
        return html`
          <fieldset class="op-opcoes op-maquinas">
            <legend class="op-rotulo-g">Selecione a máquina utilizada</legend>
            ${E.maquinas.map((m, i) => html`
              <label class="opcao opcao-g"><input type="radio" name="maquina" id="op-maquina-${i}" value="${m.id}" ${marcado(E.maquinaId === m.id)}>
                <span>${icone('maquina', 26)}${m.nome}</span></label>`)}
          </fieldset>
          <p class="form-erro" id="op-erro" role="alert" hidden></p>`;
      }

      /* ---------- Etapa 4: fotografia ---------- */
      function verificacaoHtml(v) {
        const linha = (ok, texto) => html`<li class="${ok ? 'ok' : 'atencao'}">${icone(ok ? 'check' : 'alerta', 18)}<span>${texto}</span></li>`;
        const luz = { ok: 'Iluminação adequada', escura: 'Iluminação: foto escura', clara: 'Iluminação: foto clara demais', nao_avaliada: 'Iluminação não avaliada neste aparelho' };
        const foco = { ok: 'Nitidez adequada', baixa: 'Nitidez: possível desfoque', nao_avaliada: 'Nitidez não avaliada neste aparelho' };
        return html`
          <ul class="op-verificacao">
            ${linha(v.arquivoValido, v.arquivoValido ? 'Arquivo de imagem válido' : 'Arquivo inválido')}
            ${v.arquivoValido ? linha(v.naoVazia !== false, v.naoVazia !== false ? 'Imagem com conteúdo' : 'Imagem vazia') : ''}
            ${v.largura ? linha(v.resolucaoOk, (v.resolucaoOk ? 'Resolução adequada' : 'Resolução insuficiente') + ' (' + v.largura + '×' + v.altura + ' px)') : ''}
            ${v.arquivoValido && v.naoVazia !== false ? linha(v.iluminacao === 'ok', luz[v.iluminacao]) : ''}
            ${v.arquivoValido && v.naoVazia !== false ? linha(v.nitidez === 'ok', foco[v.nitidez]) : ''}
          </ul>`;
      }

      function telaFoto() {
        const c = E.captura, principal = E.fotos[0], extras = E.fotos.slice(1);
        if (c && c.estado === 'verificando') return html`
          <section class="cartao op-verificando"><span class="girando"></span><p>Verificando a imagem…</p></section>`;
        if (c && c.estado === 'erro') return html`
          <section class="cartao">
            <div class="alerta alerta-erro">${icone('alerta', 20)}<div><strong>Esta imagem não pode ser usada.</strong>${c.resultado.erros.map((e) => html`<p>${e}</p>`)}</div></div>
            ${verificacaoHtml(c.resultado.verificacao)}
            <div class="op-acoes-foto">
              <button type="button" class="btn btn-primario btn-g btn-bloco" data-acao="fotografar" data-alvo="${c.alvo}">${icone('camera', 22)}<span>Fotografar novamente</span></button>
              <button type="button" class="btn btn-fantasma btn-bloco" data-acao="cancelar-captura">Voltar</button>
            </div>
          </section>`;
        if (c && c.estado === 'previa') return html`
          <section class="cartao op-previa">
            <h2>${c.alvo === 'principal' ? 'Confira a fotografia da amostra' : 'Confira a fotografia complementar'}</h2>
            <img class="op-foto-grande" src="${c.url}" alt="Pré-visualização da fotografia">
            ${c.resultado.avisos.length ? html`<div class="alerta alerta-alerta">${icone('alerta', 20)}<div>${c.resultado.avisos.map((a) => html`<p>${a}</p>`)}</div></div>` : ''}
            ${verificacaoHtml(c.resultado.verificacao)}
            <p class="texto-menor">Verificação básica automática. A conferência visual continua sendo do operador.</p>
            <div class="op-acoes-foto">
              <button type="button" class="btn btn-primario btn-g btn-bloco" data-acao="usar-foto">${icone('check', 22)}<span>Usar esta foto</span></button>
              <button type="button" class="btn btn-secundario btn-g btn-bloco" data-acao="fotografar" data-alvo="${c.alvo}">${icone('camera', 22)}<span>Fotografar novamente</span></button>
            </div>
          </section>`;

        if (!principal) return html`
          <section class="cartao op-guia">
            <svg class="op-guia-desenho" viewBox="0 0 220 150" role="img" aria-label="Bandeja com a amostra de sementes vista de cima">
              <rect x="34" y="14" width="152" height="122" rx="10" class="guia-bandeja"/>
              <rect x="44" y="24" width="132" height="102" rx="6" class="guia-fundo"/>
              ${ui.bruto(sementesDoGuia())}
              <path d="M12 30V12h18M208 30V12h-18M12 120v18h18M208 120v18h-18" class="guia-mira"/>
            </svg>
            <h2>Fotografe a amostra de sementes tratadas</h2>
            <ul class="op-guia-lista">
              <li>${icone('check', 18)}<span>Somente a amostra na bandeja, vista de cima.</span></li>
              <li>${icone('check', 18)}<span>Bandeja inteira dentro da foto, em local bem iluminado.</span></li>
              <li>${icone('check', 18)}<span>Não é preciso fotografar a máquina nem a operação.</span></li>
            </ul>
            <button type="button" class="btn btn-primario btn-g btn-bloco" data-acao="fotografar" data-alvo="principal">${icone('camera', 24)}<span>Fotografar amostra</span></button>
          </section>`;

        return html`
          <section class="cartao">
            <div class="op-secao-topo"><h2>Fotografia principal</h2>${ui.seloSimples('Obrigatória', 'selo-registrada', 'check')}</div>
            <img class="op-foto-grande" src="${principal.url}" alt="Fotografia principal da amostra">
            <p class="texto-menor">Capturada em ${util.fmtDataHora(principal.capturadaEm, true)} · ${principal.largura}×${principal.altura} px</p>
            <button type="button" class="btn btn-secundario btn-bloco" data-acao="fotografar" data-alvo="principal">${icone('camera', 20)}<span>Substituir fotografia</span></button>
          </section>
          <section class="cartao">
            <div class="op-secao-topo"><h2>Fotografias complementares</h2><span class="texto-menor">${extras.length} de ${cfg.FOTO.MAX_COMPLEMENTARES} · opcional</span></div>
            <div class="op-extras">
              ${extras.map((f, i) => html`
                <figure>
                  <img src="${f.url}" alt="Fotografia complementar ${i + 1}">
                  <button type="button" class="btn-icone op-extra-remover" data-acao="remover-foto" data-indice="${i + 1}" aria-label="Remover fotografia complementar ${i + 1}">${icone('x', 18)}</button>
                </figure>`)}
              ${extras.length < cfg.FOTO.MAX_COMPLEMENTARES ? html`
                <button type="button" class="op-extra-nova" data-acao="fotografar" data-alvo="complementar">${icone('mais', 24)}<span>Adicionar foto</span></button>` : ''}
            </div>
          </section>`;
      }
      function sementesDoGuia() {
        let s = '';
        for (let l = 0; l < 6; l++) for (let c = 0; c < 9; c++) {
          const x = 53 + c * 14.2 + (l % 2 ? 6 : 0), y = 34 + l * 16.4;
          if (x < 170) s += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="5.6" ry="4.6" class="guia-semente"/>';
        }
        return s;
      }

      function aoEscolherArquivo(arquivo) {
        if (!arquivo) return;
        const alvo = E.alvo;
        if (E.captura && E.captura.url) URL.revokeObjectURL(E.captura.url);
        E.captura = { alvo: alvo, estado: 'verificando' };
        desenhar();
        TSI.imagem.processar(arquivo).then((res) => {
          if (E.tela !== 'foto' || !E.captura) return;
          if (!res.ok) { E.captura = { alvo: alvo, estado: 'erro', resultado: res }; desenhar(); return; }
          E.captura = { alvo: alvo, estado: 'previa', resultado: res, url: URL.createObjectURL(new Blob([res.foto.dados], { type: res.foto.tipo })) };
          desenhar();
          global.scrollTo(0, 0);
        }).catch((e) => { E.captura = null; desenhar(); ui.erro(e); });
      }
      function usarFoto() {
        const c = E.captura;
        if (!c || c.estado !== 'previa') return;
        const f = c.resultado.foto;
        f.url = c.url;
        if (c.alvo === 'principal') {
          if (E.fotos[0] && E.fotos[0].url) URL.revokeObjectURL(E.fotos[0].url);
          E.fotos[0] = f;
        } else if (E.fotos.length < 1 + cfg.FOTO.MAX_COMPLEMENTARES) {
          E.fotos.push(f);
        }
        E.captura = null;
        desenhar();
        global.scrollTo(0, 0);
        salvarRascunho();
      }

      /* ---------- Etapa 5: resumo ---------- */
      function telaResumo() {
        const o = E.ordem, m = maquinaAtual(), prevista = TSI.ordens.qtdPrevista(o), efetiva = util.paraNumero(E.qtd);
        const diverge = TSI.registros.haDivergencia(prevista, efetiva);
        return html`
          <section class="cartao">
            ${ui.dados([
              ['Ordem de tratamento', o.ordemTsi], ['Lote', o.lote], ['Cultivar', o.cultivar], ['Tratamento', o.tratamento],
              ['Máquina', m ? m.nome : '—'], ['Operador', usuario.nome],
              ['Quantidade prevista', TSI.ordens.fmtQtd(prevista, o)], ['Quantidade efetiva', TSI.ordens.fmtQtd(efetiva, o)],
              diverge ? { rotulo: 'Justificativa da divergência', valor: E.motivo + (util.limpar(E.descricao) ? ' — ' + util.limpar(E.descricao) : ''), largo: true } : null
            ], 'dados-2col')}
          </section>
          <section class="cartao">
            <div class="op-secao-topo"><h2>Fotografias</h2><span class="texto-menor">${util.plural(E.fotos.length, 'fotografia', 'fotografias')}</span></div>
            <div class="op-fotos-resumo">
              ${E.fotos.map((f, i) => html`<figure><img src="${f.url}" alt="${i === 0 ? 'Fotografia principal' : 'Fotografia complementar ' + i}"><figcaption>${i === 0 ? 'Principal' : 'Complementar ' + i}</figcaption></figure>`)}
            </div>
          </section>
          <p class="op-ajuda">Depois de enviado, o registro não pode ser alterado pelo operador.</p>`;
      }

      function enviar(botao) {
        return ui.ocupar(botao, () => TSI.registros.criar({
          ordemTsi: E.ordem.ordemTsi, qtdEfetiva: E.qtd, motivoDivergencia: E.motivo, descricaoDivergencia: E.descricao,
          maquinaId: E.maquinaId, fotos: E.fotos
        }).then((reg) => {
          limparFluxo();
          E.registro = reg;
          return carregarInicio().then(() => ir('sucesso'));
        })).catch((e) => {
          ui.erro(e);
          if (e && e.amigavel && /já possui registro|não aceita registro|não localizada/.test(e.message)) {
            TSI.registros.descartarRascunho(usuario.id).then(irInicio);
          }
        });
      }

      function telaSucesso() {
        const r = E.registro, o = r.ordem || {};
        return html`
          <section class="op-sucesso">
            <span class="op-sucesso-icone">${icone('check', 44)}</span>
            <h1>Registro salvo</h1>
            <p>Ordem ${r.ordemTsi} · ${o.lote || '—'} · ${o.cultivar || '—'}</p>
            <div class="op-protocolo"><span>Protocolo</span><strong id="op-protocolo">${r.protocolo}</strong></div>
            <div class="op-sucesso-envio">${ui.seloEnvio(r.situacaoEnvio)}<span class="texto-menor">Guardado neste aparelho em ${util.fmtDataHora(r.criadoEm)}</span></div>
            <div class="op-sucesso-acoes">
              <button type="button" class="btn btn-secundario btn-g btn-bloco" data-acao="pdf" data-id="${r.id}">${icone('pdf', 22)}<span>Gerar PDF</span></button>
              ${TSI.arquivos.podeCompartilhar() ? html`<button type="button" class="btn btn-secundario btn-g btn-bloco" data-acao="compartilhar" data-id="${r.id}">${icone('compartilhar', 22)}<span>Compartilhar PDF</span></button>` : ''}
              <button type="button" class="btn btn-primario btn-g btn-bloco" data-acao="novo">${icone('mais', 22)}<span>Novo registro</span></button>
            </div>
          </section>`;
      }

      /* ---------- Meus registros e detalhe ---------- */
      function telaMeus() {
        return E.meus.length ? html`<ul class="op-lista">${E.meus.map(itemRegistro)}</ul>`
          : ui.vazio('camera', 'Nenhum registro enviado', 'Os registros enviados por você aparecem aqui.');
      }
      function abrirRegistro(id) {
        return Promise.all([TSI.registros.obter(id), TSI.registros.fotosDe(id)]).then((r) => {
          if (!r[0] || r[0].operadorId !== usuario.id) { ui.aviso('Registro não disponível.', 'erro'); return; }
          urls.liberar();
          E.origemDetalhe = E.tela === 'meus' ? 'meus' : 'inicio';
          E.detalhe = { registro: r[0], fotos: r[1].map((f) => ({ foto: f, url: urls.daFoto(f) })) };
          ir('detalhe');
        });
      }
      function telaDetalhe() {
        const r = E.detalhe.registro, fotos = E.detalhe.fotos;
        return html`
          ${r.erroEnvio && r.situacaoEnvio === 'falha' ? html`<div class="alerta alerta-erro">${icone('nuvemErro', 20)}<div><strong>Este registro não foi enviado ao servidor</strong>
            <p>${r.erroEnvio}</p><p>As fotografias continuam guardadas neste aparelho. Avise o administrador.</p></div></div>` : ''}
          ${r.anulado ? html`<div class="alerta alerta-erro">${icone('anular', 20)}<div><strong>Registro anulado pelo administrador</strong>
            <p>${util.fmtDataHora(r.anulado.em)} · ${r.anulado.porNome} · ${r.anulado.motivo}</p></div></div>` : ''}
          <section class="cartao">
            ${fotos[0] ? html`<img class="op-foto-grande" src="${fotos[0].url}" alt="Fotografia principal da amostra">` : ''}
            ${fotos.length > 1 ? html`<div class="op-fotos-resumo">${fotos.slice(1).map((f, i) => html`<figure><img src="${f.url}" alt="Fotografia complementar ${i + 1}"><figcaption>Complementar ${i + 1}</figcaption></figure>`)}</div>` : ''}
          </section>
          <section class="cartao">
            ${ui.dados(ui.paresDoRegistro(r).concat([{ rotulo: 'Protocolo', valor: r.protocolo, largo: true }]), 'dados-2col')}
            <div class="op-sucesso-envio">${ui.seloEnvio(r.situacaoEnvio)}${r.corrigidoEm ? html`<span class="texto-menor">Corrigido pelo administrador em ${util.fmtDataHora(r.corrigidoEm)}</span>` : ''}</div>
          </section>
          <div class="op-acoes-foto">
            <button type="button" class="btn btn-primario btn-g btn-bloco" data-acao="pdf" data-id="${r.id}">${icone('pdf', 22)}<span>Gerar PDF</span></button>
            ${TSI.arquivos.podeCompartilhar() ? html`<button type="button" class="btn btn-secundario btn-g btn-bloco" data-acao="compartilhar" data-id="${r.id}">${icone('compartilhar', 22)}<span>Compartilhar PDF</span></button>` : ''}
          </div>
          <p class="op-ajuda">Registro enviado não pode ser alterado nem excluído pelo operador. Para correções, procure o administrador.</p>`;
      }

      function abrirMenu() {
        const m = ui.modal({
          titulo: usuario.nome, largura: 'p',
          conteudo: html`
            <div class="op-menu">
              <p class="texto-menor">${cfg.ROTULO_PERFIL[usuario.perfil]} · usuário ${usuario.usuario}</p>
              <button type="button" class="btn btn-secundario btn-g btn-bloco" data-menu="meus">${icone('camera', 22)}<span>Meus registros</span></button>
              ${TSI.auth.ehAdm() ? html`<button type="button" class="btn btn-secundario btn-g btn-bloco" data-menu="painel">${icone('painel', 22)}<span>Abrir o painel</span></button>` : ''}
              <button type="button" class="btn btn-fantasma btn-g btn-bloco" data-menu="sair">${icone('sair', 22)}<span>Sair</span></button>
            </div>`
        });
        m.corpo.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-menu]');
          if (!b) return;
          m.fechar();
          if (b.dataset.menu === 'meus') { limparSeForaDoFluxo(); carregarInicio().then(() => ir('meus')); }
          else if (b.dataset.menu === 'painel') ctx.aoIrParaPainel();
          else ctx.aoSair();
        });
      }
      function limparSeForaDoFluxo() { if (ETAPAS.some((e) => e.id === E.tela)) limparFluxo(); }

      /* ---------- Eventos ---------- */
      const ACOES = {
        voltar() {
          const i = ETAPAS.findIndex((e) => e.id === E.tela);
          if (E.tela === 'foto' && E.captura) { if (E.captura.url) URL.revokeObjectURL(E.captura.url); E.captura = null; return desenhar(); }
          if (i > 0) return ir(ETAPAS[i - 1].id);
          if (E.tela === 'detalhe') { urls.liberar(); return ir(E.origemDetalhe); }
          return irInicio();
        },
        menu: abrirMenu,
        'outra-ordem': irInicio,
        'confirmar-ordem'() {
          if (E.qtd === '' && E.ordem.classeEmbalagem === 'BIG_BAG') {
            const p = TSI.ordens.qtdPrevista(E.ordem);
            E.qtd = p === null ? '' : String(p).replace('.', ',');
          }
          ir('quantidade');
        },
        'qtd-menos'() { passo(-1); },
        'qtd-mais'() { passo(1); },
        'avancar-quantidade'() {
          try {
            const n = TSI.registros.validarQuantidade(E.qtd);
            TSI.registros.validarJustificativa(TSI.registros.haDivergencia(TSI.ordens.qtdPrevista(E.ordem), n), E.motivo, E.descricao);
            if (!TSI.registros.haDivergencia(TSI.ordens.qtdPrevista(E.ordem), n)) { E.motivo = ''; E.descricao = ''; }
          } catch (e) { return erroEtapa(ui.mensagemDe(e)); }
          carregarMaquinas().then(() => ir('maquina')).catch(ui.erro);
        },
        'avancar-maquina'() {
          if (!maquinaAtual()) return erroEtapa('Selecione a máquina utilizada.');
          ir('foto');
        },
        fotografar(ev, alvo) {
          E.alvo = alvo.dataset.alvo || 'principal';
          const entrada = raiz.querySelector('#op-foto-entrada');
          entrada.value = '';
          entrada.click();
        },
        'cancelar-captura'() { E.captura = null; desenhar(); },
        'usar-foto': usarFoto,
        'remover-foto'(ev, alvo) {
          const i = Number(alvo.dataset.indice);
          const f = E.fotos[i];
          if (!f || i === 0) return;
          if (f.url) URL.revokeObjectURL(f.url);
          E.fotos.splice(i, 1);
          desenhar();
          salvarRascunho();
        },
        'avancar-foto'() {
          if (!E.fotos.length) return;
          if (!maquinaAtual()) { ui.aviso('Selecione novamente a máquina utilizada.', 'alerta'); return carregarMaquinas().then(() => ir('maquina')); }
          ir('resumo');
        },
        enviar(ev, alvo) { enviar(alvo); },
        novo: irInicio,
        retomar() { retomarRascunho().catch(ui.erro); },
        'descartar-rascunho'() {
          ui.confirmar({ titulo: 'Descartar registro em andamento?', mensagem: 'Os dados e as fotografias da ordem ' + E.rascunho.ordemTsi + ' que ainda não foram enviados serão apagados deste aparelho.',
            rotuloConfirmar: 'Descartar', perigo: true }).then((r) => {
            if (!r) return;
            TSI.registros.descartarRascunho(usuario.id).then(() => { E.rascunho = null; desenhar(); });
          });
        },
        'ver-meus'() { ir('meus'); },
        'abrir-registro'(ev, alvo) { abrirRegistro(alvo.dataset.id).catch(ui.erro); },
        pdf(ev, alvo) { ui.gerarPdf(alvo.dataset.id, alvo); },
        compartilhar(ev, alvo) { ui.compartilharPdf(alvo.dataset.id, alvo); }
      };
      function passo(delta) {
        const campo = raiz.querySelector('#op-qtd');
        let n = util.paraNumero(E.qtd);
        if (n === null) { const p = TSI.ordens.qtdPrevista(E.ordem); n = p === null ? 0 : p; if (delta > 0) delta = 0; }
        n = Math.max(0, Math.round((n + delta) * 100) / 100);
        E.qtd = String(n).replace('.', ',');
        campo.value = E.qtd;
        erroEtapa('');
        atualizarDivergencia();
      }

      function aoClicar(ev) {
        const alvo = ev.target.closest('[data-acao]');
        if (!alvo || !raiz.contains(alvo) || alvo.disabled) return;
        const fn = ACOES[alvo.dataset.acao];
        if (fn) fn(ev, alvo);
      }
      function aoEnviarForm(ev) {
        if (ev.target.id !== 'op-form-busca') return;
        ev.preventDefault();
        ui.ocupar(raiz.querySelector('#op-pesquisar'), () => pesquisar(ev.target.ordem.value)).catch(ui.erro);
      }
      function aoDigitar(ev) {
        const t = ev.target;
        if (t.id === 'op-qtd') { E.qtd = t.value; erroEtapa(''); atualizarDivergencia(); }
        else if (t.id === 'op-descricao') { E.descricao = t.value; }
        else if (t.id === 'op-ordem') { E.busca = t.value; }
      }
      function aoMudar(ev) {
        const t = ev.target;
        if (t.name === 'motivo') { E.motivo = t.value; erroEtapa(''); atualizarDivergencia(); }
        else if (t.name === 'maquina') { E.maquinaId = t.value; erroEtapa(''); }
        else if (t.id === 'op-foto-entrada') { aoEscolherArquivo(t.files && t.files[0]); }
      }

      raiz.addEventListener('click', aoClicar);
      raiz.addEventListener('submit', aoEnviarForm);
      raiz.addEventListener('input', aoDigitar);
      raiz.addEventListener('change', aoMudar);
      desligarEventos.push(TSI.eventos.ouvir('conexao:alterada', () => {
        const el = raiz.querySelector('#op-offline');
        if (el) el.hidden = TSI.sincronizacao.online();
      }));
      desligarEventos.push(TSI.eventos.ouvir('ordens:alterado', () => {
        if (E.tela === 'inicio') carregarInicio().then(() => { if (E.tela === 'inicio') desenhar(); });
      }));
      desligarEventos.push(TSI.eventos.ouvir('registros:alterado', () => {
        if (E.tela === 'inicio' || E.tela === 'meus') carregarInicio().then(() => { if (E.tela === 'inicio' || E.tela === 'meus') desenhar(); });
      }));

      carregarInicio().then(() => ir('inicio')).catch(ui.erro);

      return function desmontar() {
        raiz.removeEventListener('click', aoClicar);
        raiz.removeEventListener('submit', aoEnviarForm);
        raiz.removeEventListener('input', aoDigitar);
        raiz.removeEventListener('change', aoMudar);
        desligarEventos.forEach((f) => f());
        E.fotos.forEach((f) => f.url && URL.revokeObjectURL(f.url));
        if (E.captura && E.captura.url) URL.revokeObjectURL(E.captura.url);
        urls.liberar();
        raiz.innerHTML = '';
      };
    }
  };
})(window);
