-- 20261018000000_close_overbroad_anon_policies.sql
--
-- Cierra los dos agujeros allow-all restantes (auditoría Lote-1, 2026-10-18).
--
-- 1. `pp_optimization_history`: las políticas `allow_insert/select/update_for_all`
--    (`WITH CHECK (true)` / `USING (true)`, de 20250326) siguen vivas. La de
--    UPDATE permite a cualquier visitante reescribir el historial ajeno; la de
--    SELECT expone prompts ajenos; la de INSERT anula la guarda
--    `pp_history_guest_insert_guarded` (dos políticas INSERT = OR).
--    Por qué es seguro quitarlas: todo acceso de la app pasa por service_role
--    (`/api/history`, `/api/save-history`, `/api/auth/claim-guest-history`,
--    página `/s/[shareId]` vía `getServiceClient()`), que ignora RLS.
--    El INSERT guest sigue abierto vía `pp_history_guest_insert_guarded`.
-- 2. `pp_user_profiles`: las políticas `pp_user_profiles_{select,insert,update}_all`
--    (`USING (true)`, de la migración pp504) coexisten con las `*_own`
--    (`auth.uid() = id`, de abril) sobre la misma tabla → allow-all efectivo.
--    Se retiran las `_all`; quedan solo las `*_own`. Los inserts de signup van
--    por trigger SECURITY DEFINER (bypass RLS) y la ruta `/api/profile` usa
--    service_role.
-- 3. `optimization_logs`: el INSERT anon se endurece contra suplantación de
--    `user_id` (columna añadida en 20260419). Anon queda obligado a
--    `user_id IS NULL`; un usuario autenticado solo puede declarar su propio
--    id. El servidor escribe con service_role (bypass), incluido el backfill
--    de `claim-guest-history`.
--
-- Idempotente: `IF EXISTS` en cada DROP. Seguro de re-ejecutar.
-- ROLLBACK (restaura el comportamiento anterior, NO usar por defecto):
--   CREATE POLICY "allow_select_for_all" ON public.pp_optimization_history FOR SELECT USING (true);
--   CREATE POLICY "allow_update_for_all" ON public.pp_optimization_history FOR UPDATE USING (true);
--   CREATE POLICY "allow_insert_for_all" ON public.pp_optimization_history FOR INSERT WITH CHECK (true);
--   CREATE POLICY pp_user_profiles_select_all ON public.pp_user_profiles FOR SELECT USING (true);
--   CREATE POLICY pp_user_profiles_insert_all ON public.pp_user_profiles FOR INSERT WITH CHECK (true);
--   CREATE POLICY pp_user_profiles_update_all ON public.pp_user_profiles FOR UPDATE USING (true) WITH CHECK (true);

-- 1. Historial: fuera las tres allow-all. El INSERT guest acotado sobrevive.
DROP POLICY IF EXISTS "allow_insert_for_all" ON public.pp_optimization_history;
DROP POLICY IF EXISTS "allow_select_for_all" ON public.pp_optimization_history;
DROP POLICY IF EXISTS "allow_update_for_all" ON public.pp_optimization_history;

-- 2. Perfiles: fuera las tres _all. Quedan solo las *_own (auth.uid() = id).
DROP POLICY IF EXISTS pp_user_profiles_select_all ON public.pp_user_profiles;
DROP POLICY IF EXISTS pp_user_profiles_insert_all ON public.pp_user_profiles;
DROP POLICY IF EXISTS pp_user_profiles_update_all ON public.pp_user_profiles;

-- 3. Logs: el INSERT anon no puede declarar user_id ajeno.
DROP POLICY IF EXISTS "Allow anon insert" ON public.optimization_logs;
CREATE POLICY "Allow anon insert" ON public.optimization_logs
  FOR INSERT
  WITH CHECK (
    session_id IS NOT NULL
    AND length(session_id) BETWEEN 1 AND 200
    AND (user_id IS NULL OR user_id = auth.uid())
  );
