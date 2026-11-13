// =============================================================================
// Edge Function "tsi-usuarios" — cadastro de usuários pelo painel do administrador
// -----------------------------------------------------------------------------
// Criar usuário e redefinir senha exigem a chave secreta do projeto, que nunca vai
// para o navegador. Esta função roda no Supabase, confere que quem chama é um
// Administrador ativo e só então executa a ação.
//
// Publicação: Supabase → Edge Functions → Deploy a new function → Via Editor,
// nome "tsi-usuarios", cole este arquivo inteiro e clique em Deploy.
//
// Ações (corpo JSON):
//   { acao: 'criar', nome, usuario, senha, perfil, ativo, dominio }
//   { acao: 'editar', id, nome, usuario, perfil, dominio }
//   { acao: 'senha', id, senha }
//   { acao: 'situacao', id, ativo }
// =============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const ROTULO_PERFIL: Record<string, string> = { ADM: 'Administrador', OPERADOR: 'Operador' };
const SENHA_MINIMA = 6;
const DOMINIO_PADRAO = 'tsi.doismarcos.com.br';

class ErroAmigavel extends Error {
  status: number;
  constructor(mensagem: string, status = 400) { super(mensagem); this.status = status; }
}

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function limpar(v: unknown) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }

function validar(d: any, exigirSenha: boolean) {
  const nome = limpar(d.nome), usuario = limpar(d.usuario).toLowerCase();
  if (nome.length < 3) throw new ErroAmigavel('Informe o nome completo.');
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) throw new ErroAmigavel('O nome de usuário deve ter de 3 a 30 letras ou números, sem espaços.');
  if (!ROTULO_PERFIL[d.perfil]) throw new ErroAmigavel('Selecione o perfil de acesso.');
  if (exigirSenha) validarSenha(d.senha);
  return { nome, usuario };
}
function validarSenha(senha: unknown) {
  if (!senha || String(senha).length < SENHA_MINIMA) throw new ErroAmigavel(`A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`);
}
function emailDe(usuario: string, dominio: unknown) {
  const d = limpar(dominio).toLowerCase() || DOMINIO_PADRAO;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw new ErroAmigavel('Domínio de login inválido na configuração do sistema.');
  return `${usuario}@${d}`;
}

export async function tratar(req: Request, env = (k: string) => (globalThis as any).Deno?.env.get(k)): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);

  try {
    const url = env('SUPABASE_URL');
    const chaveSecreta = env('SUPABASE_SERVICE_ROLE_KEY') || env('TSI_CHAVE_SECRETA');
    if (!url || !chaveSecreta) throw new ErroAmigavel('Função sem configuração do servidor (SUPABASE_URL / chave secreta).', 500);
    const admin = createClient(url, chaveSecreta, { auth: { persistSession: false, autoRefreshToken: false } });

    // quem está chamando?
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: chamador, error: erroToken } = await admin.auth.getUser(token);
    if (erroToken || !chamador?.user) throw new ErroAmigavel('Sessão encerrada. Entre novamente.', 401);
    const { data: eu } = await admin.from('tsi_perfis').select('*').eq('id', chamador.user.id).maybeSingle();
    if (!eu || !eu.ativo || eu.perfil !== 'ADM') throw new ErroAmigavel('Operação permitida somente ao Administrador.', 403);

    const d = await req.json().catch(() => ({}));
    const eventos: any[] = [];
    const evento = (alvo: any, acao: string, campo: string | null, antes: unknown, depois: unknown) => {
      const rotulo = `${alvo.nome} (${alvo.usuario})`;
      eventos.push({ dados: {
        id: crypto.randomUUID(), dataHora: new Date().toISOString(), usuarioId: eu.id, usuarioNome: eu.nome,
        entidade: 'usuario', entidadeId: alvo.id, entidadeChave: `usuario:${alvo.id}`, rotulo, acao, campo,
        valorAnterior: antes ?? null, valorNovo: depois ?? null, motivo: null
      } });
    };
    const perfilDe = async (id: string) => {
      const { data } = await admin.from('tsi_perfis').select('*').eq('id', id).maybeSingle();
      if (!data) throw new ErroAmigavel('Usuário não encontrado.', 404);
      return data;
    };
    const admsAtivosAlem = async (id: string) => {
      const { count } = await admin.from('tsi_perfis').select('id', { count: 'exact', head: true })
        .eq('perfil', 'ADM').eq('ativo', true).neq('id', id);
      return count || 0;
    };
    const usuarioLivre = async (usuario: string, ignorar?: string) => {
      const { data } = await admin.from('tsi_perfis').select('id').eq('usuario', usuario);
      if ((data || []).some((x: any) => x.id !== ignorar)) throw new ErroAmigavel('Já existe um usuário com esse nome de usuário.');
    };

    let resultado: any;
    if (d.acao === 'criar') {
      const v = validar(d, true);
      await usuarioLivre(v.usuario);
      const { data, error } = await admin.auth.admin.createUser({
        email: emailDe(v.usuario, d.dominio), password: String(d.senha), email_confirm: true,
        user_metadata: { usuario: v.usuario, nome: v.nome, perfil: d.perfil, tsi_criado_pelo_sistema: true, criado_por: eu.nome }
      });
      if (error) throw new ErroAmigavel(/already|registered|exists/i.test(error.message) ? 'Já existe um usuário com esse nome de usuário.' : 'Não foi possível criar o usuário: ' + error.message);
      // o gatilho do banco cria o perfil; aqui garantimos os valores pedidos
      const ativo = d.ativo !== false;
      await admin.from('tsi_perfis').update({ usuario: v.usuario, nome: v.nome, perfil: d.perfil, ativo, criado_por: eu.nome }).eq('id', data.user.id);
      if (!ativo) await admin.auth.admin.updateUserById(data.user.id, { ban_duration: '876000h' });
      resultado = await perfilDe(data.user.id);
      evento(resultado, 'criacao', 'Perfil', null, ROTULO_PERFIL[d.perfil]);
    } else if (d.acao === 'editar') {
      const atual = await perfilDe(d.id);
      const v = validar(d, false);
      if (atual.perfil === 'ADM' && d.perfil !== 'ADM' && atual.ativo && (await admsAtivosAlem(atual.id)) === 0) {
        throw new ErroAmigavel('Este é o único Administrador ativo. Cadastre outro antes de mudar o perfil.');
      }
      if (v.usuario !== atual.usuario) {
        await usuarioLivre(v.usuario, atual.id);
        const { error } = await admin.auth.admin.updateUserById(atual.id, { email: emailDe(v.usuario, d.dominio), email_confirm: true });
        if (error) throw new ErroAmigavel('Não foi possível alterar o nome de usuário: ' + error.message);
      }
      await admin.from('tsi_perfis').update({ nome: v.nome, usuario: v.usuario, perfil: d.perfil }).eq('id', atual.id);
      resultado = await perfilDe(atual.id);
      if (atual.nome !== v.nome) evento(resultado, 'edicao', 'Nome completo', atual.nome, v.nome);
      if (atual.usuario !== v.usuario) evento(resultado, 'edicao', 'Nome de usuário', atual.usuario, v.usuario);
      if (atual.perfil !== d.perfil) evento(resultado, 'edicao', 'Perfil', ROTULO_PERFIL[atual.perfil], ROTULO_PERFIL[d.perfil]);
    } else if (d.acao === 'senha') {
      validarSenha(d.senha);
      const alvo = await perfilDe(d.id);
      const { error } = await admin.auth.admin.updateUserById(alvo.id, { password: String(d.senha) });
      if (error) throw new ErroAmigavel('Não foi possível redefinir a senha: ' + error.message);
      resultado = alvo;
      evento(alvo, 'senha', null, null, null);
    } else if (d.acao === 'situacao') {
      const alvo = await perfilDe(d.id);
      const ativo = d.ativo === true;
      if (alvo.ativo !== ativo) {
        if (!ativo && alvo.id === eu.id) throw new ErroAmigavel('Você não pode desativar o próprio usuário.');
        if (!ativo && alvo.perfil === 'ADM' && (await admsAtivosAlem(alvo.id)) === 0) {
          throw new ErroAmigavel('Este é o único Administrador ativo e não pode ser desativado.');
        }
        await admin.from('tsi_perfis').update({ ativo }).eq('id', alvo.id);
        // usuário inativo também não consegue entrar
        await admin.auth.admin.updateUserById(alvo.id, { ban_duration: ativo ? 'none' : '876000h' });
        evento(alvo, ativo ? 'ativacao' : 'desativacao', 'Situação', ativo ? 'Inativo' : 'Ativo', ativo ? 'Ativo' : 'Inativo');
      }
      resultado = await perfilDe(alvo.id);
    } else {
      throw new ErroAmigavel('Ação desconhecida.');
    }

    if (eventos.length) await admin.from('tsi_historico').insert(eventos);
    return resposta({ ok: true, usuario: resultado });
  } catch (e: any) {
    const amigavel = e instanceof ErroAmigavel;
    if (!amigavel) console.error(e);
    return resposta({ erro: amigavel ? e.message : 'Erro inesperado no servidor.' }, amigavel ? e.status : 500);
  }
}

if ((globalThis as any).Deno?.serve) (globalThis as any).Deno.serve((req: Request) => tratar(req));
