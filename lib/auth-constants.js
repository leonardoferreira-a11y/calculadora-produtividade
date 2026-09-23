/**
 * Constantes de autenticação/autorização do CalculArco.
 *
 * ATENÇÃO: este arquivo é importado pelo `proxy.js` e por Client Components.
 * Não adicione aqui `server-only`, acesso ao banco ou qualquer dependência de
 * Node.js — mantenha-o puro.
 */

export const COOKIE_SESSAO = 'calcularco_sessao';

/** Tamanho mínimo de senha — a regra completa está em `lib/passwords.js`. */
export const MIN_SENHA = 8;

/** Níveis de permissão já usados pelo sistema (coluna `nivel_permissao`). */
export const NIVEIS = {
  ADMIN: 'ADMIN',
  ADMIN_MAQ: 'ADMIN_MAQ',
  USER_ARCO: 'USER_ARCO',
  USER_GRAFICA: 'USER_GRAFICA',
};

/**
 * Status do usuário (coluna `status`).
 *
 * O banco grava com inicial maiúscula ("Ativo"/"Inativo"). Sempre compare
 * usando `ehStatus` para não depender da caixa.
 */
export const STATUS = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  PENDENTE: 'Pendente',
};

/** Compara status ignorando maiúsculas/minúsculas e espaços. */
export const ehStatus = (valor, alvo) =>
  String(valor ?? '').trim().toLowerCase() === String(alvo ?? '').trim().toLowerCase();

/** Nível de permissão dado a quem se cadastra sozinho (menor privilégio). */
export const NIVEL_PADRAO_SOLICITACAO = NIVEIS.USER_GRAFICA;

export const ROTAS = {
  login: '/login',
  solicitarAcesso: '/solicitar-acesso',
  redefinirSenha: '/redefinir-senha',
  painel: '/dashboard',
};

/** Rotas acessíveis sem sessão. */
export const ROTAS_PUBLICAS = [
  ROTAS.login,
  ROTAS.solicitarAcesso,
  ROTAS.redefinirSenha,
];

export const ehRotaPublica = (pathname) =>
  ROTAS_PUBLICAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  );

/**
 * RBAC: quais níveis enxergam cada rota do painel.
 * Fonte única de verdade — usada pelo menu, pelas telas e pelo `proxy.js`.
 */
export const RBAC = {
  '/dashboard':              [NIVEIS.ADMIN, NIVEIS.ADMIN_MAQ, NIVEIS.USER_ARCO, NIVEIS.USER_GRAFICA],
  '/dashboard/maquinas':     [NIVEIS.ADMIN, NIVEIS.ADMIN_MAQ],
  '/dashboard/producao':     [NIVEIS.ADMIN, NIVEIS.USER_ARCO, NIVEIS.USER_GRAFICA],
  '/dashboard/registros':    [NIVEIS.ADMIN, NIVEIS.USER_ARCO, NIVEIS.USER_GRAFICA],
  '/dashboard/calculo-kits': [NIVEIS.ADMIN, NIVEIS.USER_ARCO, NIVEIS.USER_GRAFICA],
  '/dashboard/gantt':        [NIVEIS.ADMIN, NIVEIS.ADMIN_MAQ, NIVEIS.USER_ARCO],
  '/dashboard/calculadora':  [NIVEIS.ADMIN, NIVEIS.ADMIN_MAQ, NIVEIS.USER_ARCO, NIVEIS.USER_GRAFICA],
  '/dashboard/pcp':          [NIVEIS.ADMIN, NIVEIS.ADMIN_MAQ, NIVEIS.USER_ARCO],
  // '/dashboard/fluxo':     [NIVEIS.ADMIN, NIVEIS.USER_ARCO],  // oculto — módulo interno
  '/dashboard/acessos':      [NIVEIS.ADMIN],
};

/**
 * Descobre a regra do RBAC mais específica que cobre o caminho pedido.
 * `/dashboard/gantt/qualquer-coisa` cai na regra de `/dashboard/gantt`.
 */
export function regraRbac(pathname) {
  const rotas = Object.keys(RBAC)
    .filter((rota) => pathname === rota || pathname.startsWith(`${rota}/`))
    .sort((a, b) => b.length - a.length);
  return rotas.length > 0 ? RBAC[rotas[0]] : null;
}

/** @returns {boolean} true quando o nível pode abrir a rota. */
export function podeAcessar(pathname, nivel) {
  const permitidos = regraRbac(pathname);
  if (!permitidos) return true; // rota sem regra: só exige sessão
  return permitidos.includes(String(nivel ?? '').toUpperCase());
}

/** Códigos de aviso usados em `?aviso=` para dar feedback após um redirect. */
export const AVISOS = {
  ACESSO_NEGADO: 'acesso-negado',
  SESSAO_EXPIRADA: 'sessao-expirada',
  CADASTRO_ENVIADO: 'cadastro-enviado',
  SENHA_ALTERADA: 'senha-alterada',
  SAIU: 'saiu',
};

export const MENSAGENS_AVISO = {
  [AVISOS.ACESSO_NEGADO]:
    'Acesso restrito. Fale com um administrador do CalculArco se precisar dessa permissão.',
  [AVISOS.SESSAO_EXPIRADA]: 'Sua sessão expirou. Entre novamente para continuar.',
  [AVISOS.CADASTRO_ENVIADO]:
    'Solicitação registrada! Seu acesso ficará pendente até a aprovação de um administrador.',
  [AVISOS.SENHA_ALTERADA]: 'Senha alterada com sucesso. Faça login com a nova senha.',
  [AVISOS.SAIU]: 'Você saiu do CalculArco.',
};
