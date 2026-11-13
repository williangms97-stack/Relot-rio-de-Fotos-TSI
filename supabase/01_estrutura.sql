-- =============================================================================
-- Relatório Fotográfico de TSI — Dois Marcos Sementes
-- Banco central no Supabase: tabelas, regras de acesso, funções e fotos
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Pode ser executado de novo sem perder dados (cria só o que ainda não existe e
-- atualiza as funções).
--
-- Desenho
-- - Cada tabela guarda o documento completo do sistema em "dados" (jsonb), o mesmo
--   formato usado no aparelho. Colunas geradas a partir dele dão as chaves, os
--   índices e a regra "uma ordem, um registro válido".
-- - O navegador NÃO acessa as tabelas diretamente: tudo passa pelas funções
--   tsi_* abaixo, que conferem quem está chamando (perfil e situação).
-- - Fotos ficam no Storage, bucket privado "tsi-fotos".
-- - Prefixo tsi_ em tudo, para conviver com outras aplicações no mesmo projeto.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Perfis de acesso (um por usuário do Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.tsi_perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  usuario       text not null unique,
  nome          text not null,
  perfil        text not null default 'OPERADOR' check (perfil in ('ADM', 'OPERADOR')),
  ativo         boolean not null default false,
  criado_em     timestamptz not null default now(),
  criado_por    text,
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Dados do sistema (documento completo em "dados")
-- ---------------------------------------------------------------------------
create table if not exists public.tsi_maquinas (
  id            text primary key generated always as (dados ->> 'id') stored,
  dados         jsonb not null,
  removido      boolean not null default false,
  atualizado_em timestamptz not null default clock_timestamp()
);

create table if not exists public.tsi_ordens (
  ordem_tsi     text primary key generated always as (dados ->> 'ordemTsi') stored,
  dados         jsonb not null,
  lote          text generated always as (dados ->> 'lote') stored,
  cultivar      text generated always as (dados ->> 'cultivar') stored,
  removido      boolean not null default false,
  atualizado_em timestamptz not null default clock_timestamp()
);

-- situação vigente de ordens canceladas ou desconsideradas (reversão = removido)
create table if not exists public.tsi_ordens_inativas (
  ordem_tsi     text primary key generated always as (dados ->> 'ordemTsi') stored,
  dados         jsonb not null,
  removido      boolean not null default false,
  atualizado_em timestamptz not null default clock_timestamp()
);

create table if not exists public.tsi_importacoes (
  id            text primary key generated always as (dados ->> 'id') stored,
  dados         jsonb not null,
  removido      boolean not null default false,
  atualizado_em timestamptz not null default clock_timestamp()
);

create table if not exists public.tsi_importacoes_linhas (
  id            text primary key generated always as (dados ->> 'importacaoId') stored,
  dados         jsonb not null,
  removido      boolean not null default false,
  atualizado_em timestamptz not null default clock_timestamp()
);

create table if not exists public.tsi_registros (
  id                text primary key generated always as (dados ->> 'id') stored,
  dados             jsonb not null,
  ordem_tsi         text generated always as (dados ->> 'ordemTsi') stored,
  -- vale o número da ordem enquanto o registro é válido; "anulado:<id>" depois de anulado
  chave_ordem_ativa text generated always as (dados ->> 'chaveOrdemAtiva') stored unique,
  operador_id       text generated always as (dados ->> 'operadorId') stored,
  recebido_em       timestamptz not null default now(),
  removido          boolean not null default false,
  atualizado_em     timestamptz not null default clock_timestamp()
);

create table if not exists public.tsi_fotos (
  id            text primary key generated always as (dados ->> 'id') stored,
  dados         jsonb not null,
  registro_id   text generated always as (dados ->> 'registroId') stored,
  removido      boolean not null default false,
  atualizado_em timestamptz not null default clock_timestamp()
);

create table if not exists public.tsi_historico (
  id            text primary key generated always as (dados ->> 'id') stored,
  dados         jsonb not null,
  entidade      text generated always as (dados ->> 'entidadeChave') stored,
  removido      boolean not null default false,
  atualizado_em timestamptz not null default clock_timestamp()
);

create index if not exists tsi_registros_ordem_idx on public.tsi_registros (ordem_tsi);
create index if not exists tsi_fotos_registro_idx on public.tsi_fotos (registro_id);
create index if not exists tsi_historico_entidade_idx on public.tsi_historico (entidade);
do $$
declare t text;
begin
  foreach t in array array['tsi_maquinas','tsi_ordens','tsi_ordens_inativas','tsi_importacoes',
                           'tsi_importacoes_linhas','tsi_registros','tsi_fotos','tsi_historico'] loop
    execute format('create index if not exists %I on public.%I (atualizado_em)', t || '_atualizado_idx', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Data de atualização automática (usada para baixar só o que mudou)
-- ---------------------------------------------------------------------------
create or replace function public.tsi_marcar_atualizacao() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tsi_perfis','tsi_maquinas','tsi_ordens','tsi_ordens_inativas','tsi_importacoes',
                           'tsi_importacoes_linhas','tsi_registros','tsi_fotos','tsi_historico'] loop
    execute format('drop trigger if exists tsi_atualizacao on public.%I', t);
    execute format('create trigger tsi_atualizacao before update on public.%I for each row execute function public.tsi_marcar_atualizacao()', t);
  end loop;
end $$;

-- histórico é somente inclusão: nada é alterado nem apagado
create or replace function public.tsi_bloquear_alteracao() returns trigger
language plpgsql as $$
begin
  raise exception 'O histórico de alterações não pode ser alterado nem apagado.' using errcode = 'P0001';
end $$;
drop trigger if exists tsi_historico_imutavel on public.tsi_historico;
create trigger tsi_historico_imutavel before update or delete on public.tsi_historico
  for each row execute function public.tsi_bloquear_alteracao();

-- registros nunca são apagados (anular é uma alteração com motivo)
drop trigger if exists tsi_registros_sem_exclusao on public.tsi_registros;
create trigger tsi_registros_sem_exclusao before delete on public.tsi_registros
  for each row execute function public.tsi_bloquear_alteracao();

-- ---------------------------------------------------------------------------
-- 4. Acesso: só pelas funções. Tabelas fechadas para o navegador.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tsi_perfis','tsi_maquinas','tsi_ordens','tsi_ordens_inativas','tsi_importacoes',
                           'tsi_importacoes_linhas','tsi_registros','tsi_fotos','tsi_historico'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Perfil automático para cada usuário criado no Supabase Auth
--    - o primeiro usuário vira Administrador ativo (crie-o pelo painel do Supabase);
--    - usuários criados pelo sistema (função tsi-usuarios) já vêm com perfil e ativos;
--    - qualquer outro cadastro entra INATIVO e não acessa nada até o ADM ativar.
-- ---------------------------------------------------------------------------
create or replace function public.tsi_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_usuario text := lower(coalesce(nullif(meta ->> 'usuario', ''), split_part(new.email, '@', 1), new.id::text));
  primeiro boolean := not exists (select 1 from public.tsi_perfis where perfil = 'ADM' and ativo);
  pelo_sistema boolean := coalesce((meta ->> 'tsi_criado_pelo_sistema')::boolean, false);
begin
  -- garante nome de usuário único
  if exists (select 1 from public.tsi_perfis where usuario = v_usuario) then
    v_usuario := v_usuario || '-' || substr(new.id::text, 1, 4);
  end if;
  insert into public.tsi_perfis (id, usuario, nome, perfil, ativo, criado_por)
  values (
    new.id,
    v_usuario,
    coalesce(nullif(meta ->> 'nome', ''), case when primeiro then 'Administrador' else v_usuario end),
    case when primeiro then 'ADM' when pelo_sistema and meta ->> 'perfil' = 'ADM' then 'ADM' else 'OPERADOR' end,
    primeiro or pelo_sistema,
    case when pelo_sistema then nullif(meta ->> 'criado_por', '') else 'Painel do Supabase' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists tsi_novo_usuario on auth.users;
create trigger tsi_novo_usuario after insert on auth.users
  for each row execute function public.tsi_novo_usuario();

-- ---------------------------------------------------------------------------
-- 6. Funções auxiliares
-- ---------------------------------------------------------------------------
create or replace function public.tsi_perfil_atual() returns public.tsi_perfis
language sql stable security definer set search_path = public as $$
  select p from public.tsi_perfis p where p.id = auth.uid() and p.ativo;
$$;

-- devolve o perfil ativo de quem chama, ou interrompe com mensagem clara
create or replace function public.tsi_exigir(p_adm boolean) returns public.tsi_perfis
language plpgsql stable security definer set search_path = public as $$
declare v public.tsi_perfis;
begin
  if auth.uid() is null then
    raise exception 'Sessão encerrada. Entre novamente.' using errcode = 'P0001';
  end if;
  select * into v from public.tsi_perfis where id = auth.uid();
  if not found or not v.ativo then
    raise exception 'Usuário inativo ou sem acesso ao sistema de TSI. Procure o administrador.' using errcode = 'P0001';
  end if;
  if p_adm and v.perfil <> 'ADM' then
    raise exception 'Operação permitida somente ao Administrador.' using errcode = 'P0001';
  end if;
  return v;
end $$;

create or replace function public.tsi_usuario_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tsi_perfis where id = auth.uid() and ativo);
$$;

create or replace function public.tsi_perfil_json(p public.tsi_perfis) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'usuario', p.usuario, 'nome', p.nome, 'perfil', p.perfil, 'ativo', p.ativo,
                            'criadoEm', p.criado_em, 'criadoPor', p.criado_por,
                            'ultimoAcesso', (select u.last_sign_in_at from auth.users u where u.id = p.id));
$$;

-- tabela do servidor para cada coleção do sistema
create or replace function public.tsi_tabela(p_colecao text) returns text
language sql immutable as $$
  select case p_colecao
    when 'maquinas' then 'tsi_maquinas'
    when 'ordens' then 'tsi_ordens'
    when 'ordensInativas' then 'tsi_ordens_inativas'
    when 'importacoes' then 'tsi_importacoes'
    when 'importacoesLinhas' then 'tsi_importacoes_linhas'
    when 'registros' then 'tsi_registros'
    when 'fotos' then 'tsi_fotos'
    when 'historico' then 'tsi_historico'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Funções chamadas pelo sistema (todas recebem um único parâmetro jsonb "p")
-- ---------------------------------------------------------------------------

-- perfil de quem entrou
create or replace function public.tsi_meu_perfil(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v public.tsi_perfis;
begin
  if auth.uid() is null then
    raise exception 'Sessão encerrada. Entre novamente.' using errcode = 'P0001';
  end if;
  select * into v from public.tsi_perfis where id = auth.uid();
  if not found then
    raise exception 'Este usuário não tem acesso ao sistema de TSI.' using errcode = 'P0001';
  end if;
  return public.tsi_perfil_json(v);
end $$;

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
  v_chave := case when v_tabela in ('tsi_ordens', 'tsi_ordens_inativas') then 'ordem_tsi' else 'id' end;

  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''id'', c, ''dados'', d, ''removido'', removido, ''atualizadoEm'', atualizado_em) order by atualizado_em, c), ''[]''::jsonb)
       from (select %1$I as c, %2$s as d, removido, atualizado_em from public.%3$I
              where (atualizado_em, %1$I) > ($1, $2) %4$s
              order by atualizado_em, %1$I limit $3) x',
    v_chave, v_dados, v_tabela, v_filtro)
  into v_linhas using v_desde, v_depois, v_limite;

  return jsonb_build_object('linhas', v_linhas, 'servidorEm', clock_timestamp());
end $$;

-- linhas lidas de uma importação (consulta da planilha importada)
create or replace function public.tsi_linhas_importacao(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.tsi_exigir(true);
  select dados into v from public.tsi_importacoes_linhas where id = p ->> 'importacaoId';
  return v;
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
      update public.tsi_ordens_inativas set removido = true where ordem_tsi = op ->> 'chave';
    elsif v_tipo in ('salvar', 'inserir') then
      if v_valor is null or jsonb_typeof(v_valor) <> 'object' then
        raise exception 'Operação sem dados (%).', v_colecao using errcode = 'P0001';
      end if;
      if v_colecao = 'historico' and v_tipo <> 'inserir' then
        raise exception 'O histórico só aceita inclusões.' using errcode = 'P0001';
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
        v_chave := case when v_tabela in ('tsi_ordens', 'tsi_ordens_inativas') then 'ordem_tsi' else 'id' end;
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
  v_ordem text := r ->> 'ordemTsi';
  f jsonb;
begin
  if v_id is null or v_ordem is null then
    raise exception 'Registro incompleto.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tsi_registros where id = v_id) then
    return jsonb_build_object('situacao', 'ja_recebido', 'id', v_id);
  end if;
  if (r ->> 'operadorId') is distinct from eu.id::text then
    raise exception 'O registro pertence a outro usuário. Entre com o usuário que fez o registro para enviá-lo.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.tsi_ordens where ordem_tsi = v_ordem and not removido) then
    raise exception 'A ordem % não existe na base do RQ70.', v_ordem using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tsi_ordens_inativas where ordem_tsi = v_ordem and not removido) then
    raise exception 'A ordem % foi cancelada ou desconsiderada pelo administrador.', v_ordem using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.tsi_maquinas where id = r ->> 'maquinaId') then
    raise exception 'Máquina não cadastrada.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p -> 'fotos', '[]'::jsonb)) = 0 then
    raise exception 'O registro precisa de pelo menos uma fotografia.' using errcode = 'P0001';
  end if;

  r := r || jsonb_build_object('chaveOrdemAtiva', v_ordem, 'situacaoEnvio', 'sincronizado',
                               'operadorNome', eu.nome, 'operadorUsuario', eu.usuario);
  begin
    insert into public.tsi_registros (dados) values (r);
  exception when unique_violation then
    raise exception 'A ordem % já possui registro fotográfico feito em outro aparelho.', v_ordem using errcode = 'P0001';
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

-- lista de usuários para a tela Usuários
create or replace function public.tsi_listar_perfis(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.tsi_exigir(true);
  return coalesce((select jsonb_agg(public.tsi_perfil_json(x) order by x.nome) from public.tsi_perfis x), '[]'::jsonb);
end $$;

-- funções liberadas para usuários conectados; as auxiliares ficam fechadas
revoke all on function public.tsi_meu_perfil(jsonb), public.tsi_puxar(jsonb), public.tsi_linhas_importacao(jsonb),
  public.tsi_lote(jsonb), public.tsi_criar_registro(jsonb), public.tsi_listar_perfis(jsonb) from public, anon;
grant execute on function public.tsi_meu_perfil(jsonb), public.tsi_puxar(jsonb), public.tsi_linhas_importacao(jsonb),
  public.tsi_lote(jsonb), public.tsi_criar_registro(jsonb), public.tsi_listar_perfis(jsonb) to authenticated;
revoke all on function public.tsi_novo_usuario(), public.tsi_perfil_atual(), public.tsi_exigir(boolean),
  public.tsi_perfil_json(public.tsi_perfis) from public, anon, authenticated;
grant execute on function public.tsi_usuario_ativo() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Máquinas iniciais (mesmos identificadores do aplicativo)
-- ---------------------------------------------------------------------------
insert into public.tsi_maquinas (dados)
select jsonb_build_object('id', m.id, 'nome', m.nome, 'ativa', true, 'criadaEm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'criadaPor', 'Sistema')
from (values ('maquina-linha-01', 'Linha 01'), ('maquina-linha-02', 'Linha 02'), ('maquina-linha-03', 'Linha 03')) m(id, nome)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 9. Fotografias: bucket privado, leitura e envio só para usuários ativos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tsi-fotos', 'tsi-fotos', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "tsi fotos leitura" on storage.objects;
create policy "tsi fotos leitura" on storage.objects for select to authenticated
  using (bucket_id = 'tsi-fotos' and public.tsi_usuario_ativo());

drop policy if exists "tsi fotos envio" on storage.objects;
create policy "tsi fotos envio" on storage.objects for insert to authenticated
  with check (bucket_id = 'tsi-fotos' and (storage.foldername(name))[1] = 'registros' and public.tsi_usuario_ativo());

drop policy if exists "tsi fotos reenvio" on storage.objects;
create policy "tsi fotos reenvio" on storage.objects for update to authenticated
  using (bucket_id = 'tsi-fotos' and public.tsi_usuario_ativo())
  with check (bucket_id = 'tsi-fotos' and (storage.foldername(name))[1] = 'registros' and public.tsi_usuario_ativo());
