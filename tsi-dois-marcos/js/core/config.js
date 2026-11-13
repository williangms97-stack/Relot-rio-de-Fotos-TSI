/* ==========================================================================
   Configurações gerais do sistema
   Tudo o que é parâmetro de negócio fica aqui, para ajuste sem tocar nas telas.
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI = global.TSI || {};

  TSI.config = {
    VERSAO: '1.0.0-prototipo',
    NOME_SISTEMA: 'Relatório Fotográfico de TSI',
    EMPRESA: 'Dois Marcos Sementes',

    BANCO: { NOME: 'tsi-dois-marcos', VERSAO: 1 },

    PERFIS: { ADM: 'ADM', OPERADOR: 'OPERADOR' },
    ROTULO_PERFIL: { ADM: 'Administrador', OPERADOR: 'Operador' },

    SITUACAO_ORDEM: {
      REGISTRADA: 'registrada',
      PENDENTE: 'pendente',
      CANCELADA: 'cancelada',
      DESCONSIDERADA: 'desconsiderada'
    },
    ROTULO_SITUACAO_ORDEM: {
      registrada: 'Registrada',
      pendente: 'Pendente',
      cancelada: 'Cancelada',
      desconsiderada: 'Desconsiderada'
    },

    SITUACAO_ENVIO: { AGUARDANDO: 'aguardando', SINCRONIZADO: 'sincronizado', FALHA: 'falha' },
    ROTULO_SITUACAO_ENVIO: {
      aguardando: 'Aguardando envio',
      sincronizado: 'Sincronizado',
      falha: 'Falha no envio'
    },

    /* Motivos sugeridos quando a quantidade tratada difere da prevista no RQ70 */
    MOTIVOS_DIVERGENCIA: [
      'Sobra de sementes',
      'Perdas durante o tratamento',
      'Ajuste da quantidade solicitada',
      'Interrupção do processo',
      'Outros'
    ],
    MOTIVO_EXIGE_DESCRICAO: 'Outros',

    /* Cadastro inicial (criado somente na primeira abertura do banco).
       Os identificadores são fixos para que o mesmo cadastro inicial seja reconhecido
       em todos os aparelhos quando houver banco central. */
    MAQUINAS_INICIAIS: [
      { id: 'maquina-linha-01', nome: 'Linha 01' },
      { id: 'maquina-linha-02', nome: 'Linha 02' },
      { id: 'maquina-linha-03', nome: 'Linha 03' }
    ],
    USUARIOS_INICIAIS: [
      { id: 'usuario-admin', nome: 'Administrador', usuario: 'admin', senha: 'admin123', perfil: 'ADM' },
      { id: 'usuario-operador', nome: 'Operador de Demonstração', usuario: 'operador', senha: 'tsi123', perfil: 'OPERADOR' }
    ],
    SENHA_MINIMA: 6,

    /* Fotografia da amostra */
    FOTO: {
      LADO_MAXIMO: 2000,          // px do maior lado da imagem armazenada
      QUALIDADE: 0.86,            // JPEG
      MIN_LADO_MAIOR: 800,        // resolução mínima aceita
      MIN_LADO_MENOR: 600,
      MINIATURA: 360,             // px do maior lado da miniatura
      MAX_COMPLEMENTARES: 5,
      LUMINANCIA_MIN: 45,         // 0–255; abaixo disso a foto é considerada escura
      LUMINANCIA_MAX: 215,        // acima disso, muito clara
      DESVIO_MIN: 4,              // desvio-padrão mínimo: abaixo disso a imagem é uniforme (vazia)
      NITIDEZ_MIN: 0.025          // índice de nitidez (ver servicos/imagem.js); foto nítida fica perto de 0,3
    },

    /* Importação do RQ70 */
    IMPORTACAO: {
      ABA_PREFERIDA: 'Planilha1',
      LINHAS_BUSCA_CABECALHO: 40,
      COLUNAS_MAX: 40,
      EXTENSOES: ['.xlsx', '.xls'],
      CULTURAS_SUGERIDAS: ['Soja', 'Milho', 'Sorgo', 'Feijão', 'Trigo']
    },

    ITENS_POR_PAGINA: 50,

    /* Bibliotecas pesadas, carregadas só quando são usadas (o celular do operador
       não precisa baixar o leitor de Excel para abrir o app). */
    BIBLIOTECAS: {
      planilha: ['vendor/xlsx.full.min.js'],
      pdf: ['vendor/jspdf.umd.min.js', 'js/servicos/pdf-fontes.js']
    }
  };
})(window);
