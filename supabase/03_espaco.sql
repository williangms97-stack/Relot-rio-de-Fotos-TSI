-- =============================================================================
-- Relatório Fotográfico de TSI — atualização 03 (versão 1.3 do sistema)
-- 1. tsi_uso: quanto do banco e do espaço de fotos já foi usado (painel do ADM)
-- 2. tsi_ping: sinal de vida chamado pela tarefa automática do GitHub, para o
--    projeto gratuito do Supabase não ser pausado por falta de uso
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Pode ser executado de novo sem perder dados. Não altera nenhuma tabela.
-- =============================================================================

-- espaço usado: banco inteiro do projeto + fotos do bucket tsi-fotos (somente ADM)
create or replace function public.tsi_uso(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_banco bigint;
  v_fotos bigint;
  v_arquivos bigint;
begin
  perform public.tsi_exigir(true);
  v_banco := pg_database_size(current_database());
  select coalesce(sum((metadata ->> 'size')::bigint), 0), count(*)
    into v_fotos, v_arquivos
    from storage.objects where bucket_id = 'tsi-fotos';
  return jsonb_build_object('bancoBytes', v_banco, 'fotosBytes', v_fotos, 'fotosArquivos', v_arquivos,
                            'medidoEm', clock_timestamp());
end $$;

-- sinal de vida: não lê nem grava dados do sistema
create or replace function public.tsi_ping(p jsonb default '{}'::jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'em', clock_timestamp());
$$;

revoke all on function public.tsi_uso(jsonb), public.tsi_ping(jsonb) from public, anon;
grant execute on function public.tsi_uso(jsonb) to authenticated;
grant execute on function public.tsi_ping(jsonb) to anon, authenticated;
