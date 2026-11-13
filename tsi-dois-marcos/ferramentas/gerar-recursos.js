#!/usr/bin/env node
/* Gera js/core/recursos.js (logomarca) e js/servicos/pdf-fontes.js (fontes do PDF), embutidos em base64.
   Embutir evita leituras de arquivo em tempo de execução, o que permite abrir o
   sistema direto do disco (file://) e gerar o PDF sem servidor.

   Uso:  node ferramentas/gerar-recursos.js
   Rode novamente sempre que trocar assets/logo-dois-marcos.png ou as fontes do PDF. */
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');

function dimensoesPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('A logomarca precisa ser PNG.');
  return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
}

const logo = fs.readFileSync(path.join(raiz, 'assets/logo-dois-marcos.png'));
const dim = dimensoesPng(logo);
const negrito = fs.readFileSync(path.join(raiz, 'assets/fontes/pdf/BarlowCondensed-Bold.ttf'));
const medio = fs.readFileSync(path.join(raiz, 'assets/fontes/pdf/BarlowCondensed-Medium.ttf'));

const recursos = `/* ARQUIVO GERADO por ferramentas/gerar-recursos.js — não edite à mão.
   Logomarca oficial da Dois Marcos Sementes (assets/logo-dois-marcos.png), embutida
   para funcionar sem servidor e entrar no PDF sem alteração de proporção ou cor. */
(function (global) {
  'use strict';
  var TSI = global.TSI = global.TSI || {};
  TSI.recursos = {
    logo: 'data:image/png;base64,${logo.toString('base64')}',
    logoLargura: ${dim.largura},
    logoAltura: ${dim.altura}
  };
})(window);
`;
const fontes = `/* ARQUIVO GERADO por ferramentas/gerar-recursos.js — não edite à mão.
   Fontes do relatório PDF (Barlow Condensed, licença SIL OFL 1.1 — ver
   assets/fontes/OFL-Barlow.txt). Carregado sob demanda junto com o jsPDF. */
(function (global) {
  'use strict';
  var TSI = global.TSI = global.TSI || {};
  TSI.fontesPdf = {
    negrito: '${negrito.toString('base64')}',
    medio: '${medio.toString('base64')}'
  };
})(window);
`;
fs.writeFileSync(path.join(raiz, 'js/core/recursos.js'), recursos);
fs.writeFileSync(path.join(raiz, 'js/servicos/pdf-fontes.js'), fontes);
console.log('js/core/recursos.js gerado (' + Math.round(recursos.length / 1024) + ' KB) — logo ' + dim.largura + '×' + dim.altura + ' px');
console.log('js/servicos/pdf-fontes.js gerado (' + Math.round(fontes.length / 1024) + ' KB)');
