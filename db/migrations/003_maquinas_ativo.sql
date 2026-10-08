-- ---------------------------------------------------------------------------
-- CalculArco — inativação de máquinas
--
-- Máquina inativa continua cadastrada (histórico e tarefas antigas preservados),
-- mas sai do cálculo automático, dos seletores de equipamento e do Gantt.
-- Idempotente: pode ser executada de novo sem quebrar nada.
--
--   psql "$DATABASE_URL" -f db/migrations/003_maquinas_ativo.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE maquinas
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

-- A Rotativa Offset da Logprint tinha sido "desligada" renomeando a gráfica.
-- Volta para LOGPRINT, agora marcada como inativa.
UPDATE maquinas
   SET grafica = 'LOGPRINT',
       modelo  = 'ROTATIVA - OFFSET',
       ativo   = FALSE
 WHERE id = 2
   AND UPPER(TRIM(grafica)) = 'LOGPRINT - INATIVA';

COMMIT;
