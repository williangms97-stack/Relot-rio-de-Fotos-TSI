-- =============================================================================
-- Relatório Fotográfico de TSI — atualização 02 (versão 1.2 do sistema)
-- Cada linha do RQ70 passa a ser identificada pelo LOTE:
--   - com ordem de TSI:  "ordem|LOTE"          (uma ordem pode ter mais de um lote)
--   - sem ordem de TSI:  "SEM|LOTE|data"       (lotes tratados sem ordem também são fotografados)
--
-- Quem já tinha rodado 01_estrutura.sql antes de 17/11/2026: rode ESTE arquivo uma vez.
-- (Instalação nova: basta o 01_estrutura.sql, que já vem com este formato.)
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Pode ser executado de novo sem perder dados. Nada é apagado: as ordens, os registros
-- e as fotos que já existem são convertidos para o novo formato.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ordens: a chave passa a ser a do lote
-- ---------------------------------------------------------------------------
-- linhas importadas antes da 1.2 com "-" (ou outro texto) no lugar da ordem: viram lote sem ordem
-- (a ordem "-" é apagada mais abaixo, depois da troca da chave da tabela)
update public.tsi_ordens
   set dados = dados || jsonb_build_object(
         'ordemOriginal', dados ->> 'ordemTsi',
         'chave', 'SEM|' ||
           (case when upper(regexp_replace(coalesce(dados ->> 'lote', ''), '\s', '', 'g')) ~ '^[-–—.]*$' then ''
                 else upper(regexp_replace(coalesce(dados ->> 'lote', ''), '\s', '', 'g')) end)
           || '|' || coalesce(dados ->> 'data', dados ->> 'dataTexto', ''))
 where coalesce(dados ->> 'chave', '') = ''
   and coalesce(dados ->> 'ordemTsi', '') !~ '^[0-9]+$';

update public.tsi_ordens
   set dados = dados || jsonb_build_object('chave',
         (dados ->> 'ordemTsi') || '|' || upper(regexp_replace(coalesce(dados ->> 'lote', ''), '\s', '', 'g')))
 where coalesce(dados ->> 'chave', '') = '';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tsi_ordens' and column_name = 'chave') then
    alter table public.tsi_ordens add column chave text generated always as (dados ->> 'chave') stored;
  end if;
  if exists (select 1 from pg_constraint
              where conrelid = 'public.tsi_ordens'::regclass and contype = 'p'
                and pg_get_constraintdef(oid) like '%ordem_tsi%') then
    alter table public.tsi_ordens drop constraint tsi_ordens_pkey;
    alter table public.tsi_ordens drop column ordem_tsi;
    alter table public.tsi_ordens add column ordem_tsi text generated always as (dados ->> 'ordemTsi') stored;
    alter table public.tsi_ordens add constraint tsi_ordens_pkey primary key (chave);
  end if;
end $$;
create index if not exists tsi_ordens_ordem_idx on public.tsi_ordens (ordem_tsi);
create index if not exists tsi_ordens_lote_idx on public.tsi_ordens (lote);

-- ---------------------------------------------------------------------------
-- 2. Ordens canceladas ou desconsideradas: mesma chave da ordem
-- ---------------------------------------------------------------------------
update public.tsi_ordens_inativas i
   set dados = i.dados || jsonb_build_object('chave', o.chave)
  from public.tsi_ordens o
 where coalesce(i.dados ->> 'chave', '') = ''
   and o.dados ->> 'ordemTsi' = i.dados ->> 'ordemTsi';
update public.tsi_ordens_inativas
   set dados = dados || jsonb_build_object('chave', (dados ->> 'ordemTsi') || '|')
 where coalesce(dados ->> 'chave', '') = '';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tsi_ordens_inativas' and column_name = 'chave') then
    alter table public.tsi_ordens_inativas add column chave text generated always as (dados ->> 'chave') stored;
  end if;
  if exists (select 1 from pg_constraint
              where conrelid = 'public.tsi_ordens_inativas'::regclass and contype = 'p'
                and pg_get_constraintdef(oid) like '%ordem_tsi%') then
    alter table public.tsi_ordens_inativas drop constraint tsi_ordens_inativas_pkey;
    alter table public.tsi_ordens_inativas drop column ordem_tsi;
    alter table public.tsi_ordens_inativas add constraint tsi_ordens_inativas_pkey primary key (chave);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Registros fotográficos: passam a apontar para a chave do lote
-- ---------------------------------------------------------------------------
update public.tsi_registros r
   set dados = r.dados || jsonb_build_object('chaveOrdem', o.chave)
             || case when r.dados ->> 'chaveOrdemAtiva' = r.dados ->> 'ordemTsi'
                     then jsonb_build_object('chaveOrdemAtiva', o.chave) else '{}'::jsonb end
  from public.tsi_ordens o
 where coalesce(r.dados ->> 'chaveOrdem', '') = ''
   and o.dados ->> 'ordemTsi' = r.dados ->> 'ordemTsi';
-- registro cuja ordem não está mais na base: chave montada com o lote guardado no registro
update public.tsi_registros
   set dados = dados || jsonb_build_object('chaveOrdem',
                 (dados ->> 'ordemTsi') || '|' || upper(regexp_replace(coalesce(dados -> 'ordem' ->> 'lote', ''), '\s', '', 'g')))
             || case when dados ->> 'chaveOrdemAtiva' = dados ->> 'ordemTsi'
                     then jsonb_build_object('chaveOrdemAtiva',
                            (dados ->> 'ordemTsi') || '|' || upper(regexp_replace(coalesce(dados -> 'ordem' ->> 'lote', ''), '\s', '', 'g')))
                     else '{}'::jsonb end
 where coalesce(dados ->> 'chaveOrdem', '') = '' and coalesce(dados ->> 'ordemTsi', '') <> '';

-- ordem "-" (ou outro texto) das linhas importadas antes da 1.2: fica vazia (lote sem ordem)
update public.tsi_ordens
   set dados = dados || jsonb_build_object('ordemTsi', null)
 where dados ? 'ordemOriginal' and dados ->> 'ordemTsi' = dados ->> 'ordemOriginal';
update public.tsi_ordens_inativas
   set dados = dados || jsonb_build_object('ordemTsi', null)
 where dados ->> 'chave' like 'SEM|%' and coalesce(dados ->> 'ordemTsi', '') <> '';
update public.tsi_registros
   set dados = dados || jsonb_build_object('ordemTsi', null)
 where dados ->> 'chaveOrdem' like 'SEM|%' and coalesce(dados ->> 'ordemTsi', '') <> '';

-- ---------------------------------------------------------------------------
-- 4. Funções atualizadas (iguais às do 01_estrutura.sql)
-- ---------------------------------------------------------------------------
-- baixa o que mudou em uma coleção desde um ponto (paginado por data + id)
-- p = { colecao, desde (timestamptz, opcional), depoisId (opcional), limite }
create or replace function public.tsi_puxar(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  eu public.tsi_perfis := public.tsi_exigir(false);
  v_colecao text := p ->> 'colecao';
  v_tabela text := public.tsi_tabela(v_colecao);
  v_desde timestamptz := coalesce((p ->> 'desde')::timestamptz, '-infinity'::timestamptz);
  v_depois text := coalesce(p ->> 'depoisId', '');
  v_limite int := least(greatest(coalesce((p ->> 'limite')::int, 500), 1), 1000);
  v_chave text;
  v_filtro text := '';
  v_dados text := 'dados';
  v_linhas jsonb;
begin
  if v_tabela is null or v_colecao = 'importacoesLinhas' then
    raise exception 'Coleção inválida: %', v_colecao using errcode = 'P0001';
  end if;
  if eu.perfil <> 'ADM' then
    if v_colecao in ('historico', 'importacoes') then
      return jsonb_build_object('linhas', '[]'::jsonb);
    elsif v_colecao = 'fotos' then
      v_filtro := format(' and registro_id in (select r.id from public.tsi_registros r where r.operador_id = %L)', eu.id::text);
    elsif v_colecao = 'registros' then
      -- miniatura só dos próprios registros (economiza dados móveis)
      v_dados := format('case when operador_id = %L then dados else dados - ''miniatura'' end', eu.id::text);
    end if;
  end if;
  v_chave := case when v_tabela in ('tsi_ordens', 'tsi_ordens_inativas') then 'chave' else 'id' end;

  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''id'', c, ''dados'', d, ''removido'', removido, ''atualizadoEm'', atualizado_em) order by atualizado_em, c), ''[]''::jsonb)
       from (select %1$I as c, %2$s as d, removido, atualizado_em from public.%3$I
              where (atualizado_em, %1$I) > ($1, $2) %4$s
              order by atualizado_em, %1$I limit $3) x',
    v_chave, v_dados, v_tabela, v_filtro)
  into v_linhas using v_desde, v_depois, v_limite;

  return jsonb_build_object('linhas', v_linhas, 'servidorEm', clock_timestamp());
end $$;

-- gravações do Administrador, todas de uma vez (tudo ou nada)
-- p = { operacoes: [ { colecao, tipo: 'salvar'|'inserir'|'remover', valor | chave } ] }
create or replace function public.tsi_lote(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  eu public.tsi_perfis := public.tsi_exigir(true);
  op jsonb;
  v_colecao text;
  v_tipo text;
  v_tabela text;
  v_valor jsonb;
  v_chave text;
  n int := 0;
begin
  for op in select * from jsonb_array_elements(coalesce(p -> 'operacoes', '[]'::jsonb)) loop
    v_colecao := op ->> 'colecao';
    v_tipo := op ->> 'tipo';
    v_tabela := public.tsi_tabela(v_colecao);
    v_valor := op -> 'valor';
    if v_tabela is null then
      raise exception 'Coleção inválida: %', v_colecao using errcode = 'P0001';
    end if;

    if v_tipo = 'remover' then
      if v_colecao <> 'ordensInativas' then
        raise exception 'Exclusão não permitida em %.', v_colecao using errcode = 'P0001';
      end if;
      update public.tsi_ordens_inativas set removido = true where chave = op ->> 'chave';
    elsif v_tipo in ('salvar', 'inserir') then
      if v_valor is null or jsonb_typeof(v_valor) <> 'object' then
        raise exception 'Operação sem dados (%).', v_colecao using errcode = 'P0001';
      end if;
      if v_colecao = 'historico' and v_tipo <> 'inserir' then
        raise exception 'O histórico só aceita inclusões.' using errcode = 'P0001';
      end if;
      if v_colecao in ('ordens', 'ordensInativas') and coalesce(v_valor ->> 'chave', '') = '' then
        -- aplicativo anterior à versão 1.2 (ainda sem a chave do lote)
        if coalesce(v_valor ->> 'ordemTsi', '') = '' then
          raise exception 'Ordem sem identificação. Atualize o aplicativo e tente de novo.' using errcode = 'P0001';
        end if;
        v_valor := v_valor || jsonb_build_object('chave', coalesce(
          (select o.chave from public.tsi_ordens o where o.ordem_tsi = v_valor ->> 'ordemTsi' order by o.chave limit 1),
          (v_valor ->> 'ordemTsi') || '|' || upper(regexp_replace(coalesce(v_valor ->> 'lote', ''), '\s', '', 'g'))));
      end if;
      if v_colecao = 'registros' then
        v_valor := v_valor || jsonb_build_object('situacaoEnvio', 'sincronizado');
      elsif v_colecao = 'fotos' then
        v_valor := v_valor - 'dados';
      elsif v_colecao = 'historico' then
        -- o responsável é sempre quem está conectado
        v_valor := v_valor || jsonb_build_object('usuarioId', eu.id::text, 'usuarioNome', eu.nome);
      end if;
      if v_tipo = 'inserir' then
        begin
          execute format('insert into public.%I (dados) values ($1)', v_tabela) using v_valor;
        exception when unique_violation then
          if v_colecao = 'historico' then
            null;   -- evento já recebido (reenvio): ignora
          else
            raise exception 'Registro duplicado em %.', v_colecao using errcode = 'P0001';
          end if;
        end;
      else
        v_chave := case when v_tabela in ('tsi_ordens', 'tsi_ordens_inativas') then 'chave' else 'id' end;
        execute format('insert into public.%1$I (dados) values ($1)
                          on conflict (%2$I) do update set dados = excluded.dados, removido = false', v_tabela, v_chave)
          using v_valor;
      end if;
    else
      raise exception 'Operação inválida: %', v_tipo using errcode = 'P0001';
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('aplicadas', n);
end $$;

-- novo registro fotográfico enviado pelo celular (pode chegar mais de uma vez: idempotente)
-- p = { registro: {...}, fotos: [ {...sem os bytes, com "caminho"} ], evento: {...} }
create or replace function public.tsi_criar_registro(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  eu public.tsi_perfis := public.tsi_exigir(false);
  r jsonb := p -> 'registro';
  v_id text := r ->> 'id';
  v_chave text := nullif(r ->> 'chaveOrdem', '');
  v_rotulo text := coalesce('Ordem ' || nullif(r ->> 'ordemTsi', ''), 'Lote ' || (r -> 'ordem' ->> 'lote'), 'O lote');
  f jsonb;
begin
  if v_chave is null and nullif(r ->> 'ordemTsi', '') is not null then
    -- aplicativo anterior à versão 1.2: localiza o lote pelo número da ordem
    select o.chave into v_chave from public.tsi_ordens o
     where o.ordem_tsi = r ->> 'ordemTsi' and not o.removido
       and (o.dados ->> 'lote' is not distinct from r -> 'ordem' ->> 'lote'
            or (select count(*) from public.tsi_ordens x where x.ordem_tsi = r ->> 'ordemTsi' and not x.removido) = 1)
     order by o.chave limit 1;
    r := r || jsonb_build_object('chaveOrdem', v_chave);
  end if;
  if v_id is null or v_chave is null then
    raise exception 'Registro incompleto.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tsi_registros where id = v_id) then
    return jsonb_build_object('situacao', 'ja_recebido', 'id', v_id);
  end if;
  if (r ->> 'operadorId') is distinct from eu.id::text then
    raise exception 'O registro pertence a outro usuário. Entre com o usuário que fez o registro para enviá-lo.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.tsi_ordens where chave = v_chave and not removido) then
    raise exception '% não existe na base do RQ70.', v_rotulo using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tsi_ordens_inativas where chave = v_chave and not removido) then
    raise exception '% foi cancelado ou desconsiderado pelo administrador.', v_rotulo using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.tsi_maquinas where id = r ->> 'maquinaId') then
    raise exception 'Máquina não cadastrada.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p -> 'fotos', '[]'::jsonb)) = 0 then
    raise exception 'O registro precisa de pelo menos uma fotografia.' using errcode = 'P0001';
  end if;

  r := r || jsonb_build_object('chaveOrdemAtiva', v_chave, 'situacaoEnvio', 'sincronizado',
                               'operadorNome', eu.nome, 'operadorUsuario', eu.usuario);
  begin
    insert into public.tsi_registros (dados) values (r);
  exception when unique_violation then
    raise exception '% já possui registro fotográfico feito em outro aparelho.', v_rotulo using errcode = 'P0001';
  end;
  for f in select * from jsonb_array_elements(p -> 'fotos') loop
    insert into public.tsi_fotos (dados) values ((f - 'dados') || jsonb_build_object('registroId', v_id))
      on conflict (id) do nothing;
  end loop;
  if p ? 'evento' and jsonb_typeof(p -> 'evento') = 'object' then
    insert into public.tsi_historico (dados)
      values ((p -> 'evento') || jsonb_build_object('usuarioId', eu.id::text, 'usuarioNome', eu.nome))
      on conflict (id) do nothing;
  end if;
  return jsonb_build_object('situacao', 'recebido', 'id', v_id);
end $$;

revoke all on function public.tsi_puxar(jsonb), public.tsi_lote(jsonb), public.tsi_criar_registro(jsonb) from public, anon;
grant execute on function public.tsi_puxar(jsonb), public.tsi_lote(jsonb), public.tsi_criar_registro(jsonb) to authenticated;
