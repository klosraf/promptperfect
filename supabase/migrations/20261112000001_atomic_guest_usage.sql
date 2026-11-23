-- 20261112000001_atomic_guest_usage.sql
--
-- EGM E5 (F5-09/F2-07): la cuota guest era read-then-upsert desde la
-- ruta — dos POST concurrentes leían el mismo contador y ambos pasaban
-- el límite. Este RPC hace check-and-increment en UNA sentencia.
--
-- Semántica: devuelve la fila resultante SOLO si el incremento queda
-- por debajo o igual que p_limit; si la cuota ya estaba agotada no
-- inserta ni incrementa y devuelve cero filas (la ruta responde 429
-- con el conteo vigente). La tabla real es la de 20250404
-- (guest_id text PRIMARY KEY) — la forma uuid-PK de 20260401 nunca
-- existió: su CREATE TABLE IF NOT EXISTS fue no-op (ver addendum
-- ADR-0006).
--
-- Seguridad: función INVOKER (sin SECURITY DEFINER), search_path
-- fijado a cadena vacía con nombres cualificados, ejecución revocada
-- a PUBLIC/anon/authenticated y concedida solo a service_role (la
-- ruta la invoca exclusivamente con el cliente admin).

CREATE OR REPLACE FUNCTION public.increment_guest_usage(
  p_guest_id text,
  p_limit integer,
  p_mode text DEFAULT NULL,
  p_provider text DEFAULT NULL
)
RETURNS TABLE (optimization_count integer)
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.guest_usage AS g (
    guest_id, optimization_count, last_used_at, last_mode, last_provider
  )
  VALUES (p_guest_id, 1, now(), p_mode, p_provider)
  ON CONFLICT (guest_id) DO UPDATE
    SET optimization_count = g.optimization_count + 1,
        last_used_at = now(),
        last_mode = p_mode,
        last_provider = p_provider
    WHERE g.optimization_count < p_limit
  RETURNING g.optimization_count;
$$;

REVOKE ALL ON FUNCTION public.increment_guest_usage(text, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_guest_usage(text, integer, text, text)
  TO service_role;
