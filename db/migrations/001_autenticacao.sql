-- ---------------------------------------------------------------------------
-- CalculArco — autenticação (sessões em banco + bcrypt)
--
-- Rode uma vez no banco apontado por DATABASE_URL. É idempotente: pode ser
-- executada de novo sem quebrar nada.
--
--   psql "$DATABASE_URL" -f db/migrations/001_autenticacao.sql
--
-- Depois de rodar, defina AUTH_SECRET no .env.local (mínimo 32 caracteres):
--   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. Colunas novas em `usuarios` ------------------------------------------------
-- `senha` (texto puro) continua existindo só para a migração transparente: no
-- primeiro login bem-sucedido o valor vira hash em `senha_hash` e a coluna
-- antiga é zerada. Quando não sobrar nenhuma linha com `senha` preenchida, ela
-- pode ser removida (veja o final deste arquivo).
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS senha_hash      TEXT,
  ADD COLUMN IF NOT EXISTS ultimo_login_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now();

-- O login procura por LOWER(TRIM(email)); o índice garante unicidade real
-- (hoje "Ana@x.com" e "ana@x.com " seriam dois cadastros distintos).
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_normalizado_idx
  ON usuarios (LOWER(TRIM(email)));

-- 2. Sessões --------------------------------------------------------------------
-- O cookie carrega apenas um `sid` assinado; a sessão de verdade é esta linha,
-- o que permite revogar acesso na hora (inativar usuário, trocar senha, sair).
CREATE TABLE IF NOT EXISTS usuario_sessoes (
  id_hash     TEXT        PRIMARY KEY,
  usuario_id  INTEGER     NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  criada_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em   TIMESTAMPTZ NOT NULL,
  ip          TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS usuario_sessoes_usuario_idx ON usuario_sessoes (usuario_id);
CREATE INDEX IF NOT EXISTS usuario_sessoes_expira_idx  ON usuario_sessoes (expira_em);

-- 3. Redefinição de senha -------------------------------------------------------
-- Guardamos só o hash do token: um vazamento desta tabela não permite assumir
-- a conta de ninguém.
CREATE TABLE IF NOT EXISTS usuario_reset_senha (
  id          SERIAL      PRIMARY KEY,
  token_hash  TEXT        NOT NULL UNIQUE,
  usuario_id  INTEGER     NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em   TIMESTAMPTZ NOT NULL,
  usado_em    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS usuario_reset_senha_usuario_idx
  ON usuario_reset_senha (usuario_id);

-- 4. Auditoria ------------------------------------------------------------------
-- `autor_id` fica nulo em eventos sem autor logado (autocadastro, pedido de
-- redefinição). ON DELETE SET NULL preserva o histórico se a conta sumir.
CREATE TABLE IF NOT EXISTS usuario_auditoria (
  id         BIGSERIAL   PRIMARY KEY,
  autor_id   INTEGER     REFERENCES usuarios (id) ON DELETE SET NULL,
  alvo_id    INTEGER     REFERENCES usuarios (id) ON DELETE SET NULL,
  acao       TEXT        NOT NULL,
  detalhe    TEXT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usuario_auditoria_criado_idx ON usuario_auditoria (criado_em DESC);

COMMIT;

-- ---------------------------------------------------------------------------
-- Manutenção (rode manualmente quando fizer sentido)
-- ---------------------------------------------------------------------------

-- Quantas contas ainda usam senha em texto puro:
--   SELECT count(*) FROM usuarios WHERE senha IS NOT NULL;
--
-- Quando esse número chegar a zero (todos já logaram ao menos uma vez após a
-- migração), remova a coluna legada:
--   ALTER TABLE usuarios DROP COLUMN senha;
--
-- Limpeza de sessões e tokens vencidos:
--   DELETE FROM usuario_sessoes     WHERE expira_em < now();
--   DELETE FROM usuario_reset_senha WHERE expira_em < now();
