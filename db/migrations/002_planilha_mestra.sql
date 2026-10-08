-- Planilha Mestra — ajustes de banco (OPCIONAL).
--
-- Nenhum ALTER ... DROP NOT NULL é necessário: nas 5 tabelas só são NOT NULL
-- `grafica` (miolo/capas/encarte/kits) e `sku` (datas_iniciais), e ambos são
-- chave e sempre vêm preenchidos/validados pela importação.
-- Não há FKs nem constraints únicas entre as tabelas.

BEGIN;

-- 1. Remove duplicatas de prod_datas_iniciais criadas pelos imports antigos (que só
--    faziam INSERT). Duplicatas fazem o LEFT JOIN do Gantt repetir tarefas.
--    Mantém a linha mais recente (maior id) de cada SKU/lote/gráfica.
DELETE FROM prod_datas_iniciais d
 USING prod_datas_iniciais d2
 WHERE UPPER(TRIM(d.sku))             = UPPER(TRIM(d2.sku))
   AND UPPER(TRIM(d.filtro_producao)) = UPPER(TRIM(d2.filtro_producao))
   AND UPPER(TRIM(d.grafica))         = UPPER(TRIM(d2.grafica))
   AND d.id < d2.id;

-- 2. Impede que voltem a surgir (mesma normalização usada em todos os JOINs).
CREATE UNIQUE INDEX IF NOT EXISTS prod_datas_iniciais_sku_lote_uq
  ON prod_datas_iniciais (UPPER(TRIM(sku)), UPPER(TRIM(filtro_producao)), UPPER(TRIM(grafica)));

COMMIT;
