/* ==========================================================================
   Servidor central (Supabase)
   --------------------------------------------------------------------------
   Preencha URL e CHAVE_PUBLICA para ligar o sistema ao banco central.
   Em branco, o sistema funciona só com os dados do próprio aparelho.

   Onde encontrar: Supabase → Project Settings → API Keys (ou Data API)
   - URL: "Project URL", algo como https://abcdefghijkl.supabase.co
   - CHAVE_PUBLICA: a chave "publishable" (sb_publishable_...) ou a "anon public".
   Essas duas informações são públicas por natureza; a proteção dos dados está
   nas regras do banco (supabase/01_estrutura.sql).
   NUNCA coloque aqui a chave secreta ("secret" / "service_role").
   ========================================================================== */
(function (global) {
  'use strict';
  var TSI = global.TSI = global.TSI || {};

  TSI.servidor = {
    URL: '',
    CHAVE_PUBLICA: '',

    /* Quem entra com nome de usuário (ex.: "joao") é procurado no Supabase como
       joao@<DOMINIO_LOGIN>. Precisa ser igual ao usado ao criar os usuários. */
    DOMINIO_LOGIN: 'tsi.doismarcos.com.br',

    /* De quanto em quanto tempo (segundos) o aparelho busca novidades no servidor */
    INTERVALO_SINCRONIA: 60,

    /* Nome da Edge Function de usuários e do bucket das fotografias */
    FUNCAO_USUARIOS: 'tsi-usuarios',
    BUCKET_FOTOS: 'tsi-fotos'
  };
})(window);
