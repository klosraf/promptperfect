# E5 — Datos: cuota atómica, claim honesto y runner de migraciones íntegro
## Prompt exacto
«PromptPerfect (Supabase/Postgres, ADR-0004/0006): diseña la cuota guest atómica, el claim sin éxitos fingidos y un migrate.js que no mienta, sin aplicar migraciones a producción y sin reescribir migraciones ya aplicadas.»
## Brief
Hallazgos: F5-01, F5-02, F5-03, F5-05, F5-06, F5-07, F5-08, F5-09, F5-10, F5-11, F5-13. Patrones: PP-21, PP-22, PP-28.
## Draft v1
1. F5-09: migración nueva `20261112000001_atomic_guest_usage.sql` con RPC `increment_guest_usage(p_guest_id text, p_limit int, p_mode text, p_provider text)` — `INSERT … ON CONFLICT (guest_id) DO UPDATE SET optimization_count = guest_usage.optimization_count + 1, … WHERE guest_usage.optimization_count < p_limit RETURNING optimization_count`, con `REVOKE/GRANT EXECUTE` solo a service_role. La ruta guest-usage intenta primero la RPC; si la función no existe (migración aún no aplicada: error 42883/PGRST202), cae al camino legado SELECT→UPSERT (comportamiento actual intacto) — despliegue seguro en dos pasos. Tests de ruta para ambas ramas. Aplicación de la migración: «pendiente de decisión».
2. F5-10: claim sin admin devuelve **503** `{error, skipped:true}` (nunca ok:true); su test se actualiza. Backfill de perfil: pendiente (la semántica de qué cuenta hereda el perfil es decisión de producto).
3. F5-11: claimGuestHistory pierde la vía 3 (update anon directo sin guarda) y solo limpia el storage local tras respuesta servidor con migrated confirmado o filas re-posteadas; en fallo, conserva la copia local.
4. F5-03: migrate.js registra la versión también cuando salta una migración vacía (misma transacción/INSERT del camino normal).
5. F5-05: migrate.js y verify.js: `rejectUnauthorized: true` por defecto en hosts no locales; `PGSSL_INSECURE=1` como único escape, explícito y logueado.
6. DOC: README y supabase/README pierden la cifra «47 assertions» (la suite imprime su conteo real); addendum en ADR-0004 (25 migraciones a 2026-11-12) y en ADR-0006 (forma real de guest_usage = PK texto de 20250404; la uuid nunca existió; guest-migrate nunca existió; la cuota es fricción best-effort hasta aplicar la RPC); nota de limitación de replay en supabase/README (F5-07); host de proyecto redactado en SETUP_SHARE_FEATURE.sql (F5-08).
Diferido: F5-04 (checksum sin BD para verificar), F5-06 (convergencia de esquema = decisión), F5-13 (VERIFY_STRICT).
## Review Goldfish fresco
PENDIENTE.
## Resolve
PENDIENTE.
## Review-loop
PENDIENTE.

## Review Goldfish fresco — veredicto: APTO CON CAMBIOS
Bloqueantes (RPC): search_path fijo y tabla cualificada; REVOKE a PUBLIC/anon/authenticated (EXECUTE es público por defecto); la RPC debe ir por getSupabaseAdminClient (no por getServiceClient con fallback anon); contrato de 0 filas definido; fallback solo con allowlist exacta de códigos. Claim: el cliente debe parsear la respuesta (503/skipped ⇒ no borrar guestId). migrate.js: predicado de «vacía» estrecho.
## Resolve (diseño v2)
1. RPC: función invoker (sin SECURITY DEFINER), `SET search_path = ''`, tabla `public.guest_usage` cualificada, VALUES de inserción definidos (count=1, last_used_at=now(), last_mode/provider), `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role;`.
2. Ruta: RPC solo vía admin client (null ⇒ 503 como claim). Respuesta RPC: ≥1 fila ⇒ 200 {count, limit, remaining}; 0 filas ⇒ SELECT del conteo + 429 {limitReached:true, count, limit}. Fallback al camino legado SOLO si el error es PGRST202 o 42883 (función inexistente), con logWarn en cada fallback; cualquier otro error ⇒ 500 sin fallback. Tests de ruta para las tres ramas.
3. claimGuestHistory parsea: 503/skipped ⇒ conserva guestId y storage (reintentable); 200 {migrated:N} (incl. 0) ⇒ confirmado, limpia. El test de ruta que esperaba 200/skipped se actualiza a 503.
4. migrate.js: «vacía» = solo blancos y líneas de comentario (un fichero que empiece por `-- empty` y tenga SQL real NO se salta jamás).
## Review-loop
Goldfish verificó la semántica Postgres del ON CONFLICT … WHERE (la segunda transacción reevalúa tras el lock: el límite se sostiene) y que ninguna migración actual es vacía. APTO v2.
