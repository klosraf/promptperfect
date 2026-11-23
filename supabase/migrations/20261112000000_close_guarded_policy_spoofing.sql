-- 20261112000000_close_guarded_policy_spoofing.sql
--
-- EGM E2 (F2-02): las políticas "guarded" de 20261012 acotan el payload
-- pero NO la identidad, y en Postgres las políticas permisivas se
-- combinan con OR: basta que UNA permita el INSERT.
--
-- 1. `pp_history_guest_insert_guarded` (TO anon) no exigía
--    `user_id IS NULL` ni `share_id IS NULL`: un visitante podía
--    insertar filas de historial atribuidas a cualquier `user_id`
--    (suplantación: la fila aparece en el historial de la víctima vía
--    las consultas por user_id) o con un `share_id` prefijado.
-- 2. `opt_logs_guest_insert_guarded` (TO anon) no exigía
--    `user_id IS NULL`: anulaba por OR el endurecimiento anti-spoof de
--    20261018 sobre `optimization_logs`.
--
-- Análisis de coexistencia con "Allow anon insert" (optimization_logs,
-- redefinida en 20261018): esa política no lleva cláusula TO (aplica a
-- todos los roles) y ya exige `user_id IS NULL OR user_id = auth.uid()`.
-- Para el rol anon, auth.uid() es NULL, así que su condición equivale a
-- `user_id IS NULL`; el agujero era exclusivamente la política guarded.
-- Tras esta migración, TODAS las políticas INSERT aplicables a anon en
-- ambas tablas prohíben declarar identidad ajena. Los flujos legítimos
-- no cambian: el invitado inserta con user_id/share_id NULL y el
-- servidor escribe con service_role (bypass RLS) en claim/share.
--
-- WITH CHECK: texto verbatim de 20261012 + las cláusulas IS NULL.
-- Idempotente: DROP IF EXISTS + CREATE. Rollback: recrear las políticas
-- con el texto exacto de 20261012 (sin las cláusulas IS NULL).

DROP POLICY IF EXISTS "pp_history_guest_insert_guarded" ON public.pp_optimization_history;
CREATE POLICY "pp_history_guest_insert_guarded"
  ON public.pp_optimization_history FOR INSERT TO anon
  WITH CHECK (
    char_length(session_id) BETWEEN 1 AND 300
    AND char_length(prompt_original) BETWEEN 1 AND 60000
    AND char_length(prompt_optimized) BETWEEN 1 AND 60000
    AND mode IN ('better', 'specific', 'cot', 'production')
    AND user_id IS NULL
    AND share_id IS NULL
  );

DROP POLICY IF EXISTS "opt_logs_guest_insert_guarded" ON public.optimization_logs;
CREATE POLICY "opt_logs_guest_insert_guarded"
  ON public.optimization_logs FOR INSERT TO anon
  WITH CHECK (
    char_length(session_id) BETWEEN 1 AND 300
    AND mode IN ('better', 'specific', 'cot', 'production')
    AND prompt_length >= 0
    AND user_id IS NULL
  );
