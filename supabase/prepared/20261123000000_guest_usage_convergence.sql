-- 20261123000000_guest_usage_convergence.sql  (PREPARED — not in migrations/)
--
-- Converges the two historical guest_usage shapes onto the canonical
-- one decided in the ADR-0006 addendum of 2026-11-23: the 20250404 shape
-- (guest_id text PRIMARY KEY). That is the shape production actually
-- runs and the one every consumer keys on (the increment_guest_usage
-- RPC upserts ON CONFLICT (guest_id); /api/guest-usage selects by
-- guest_id). The uuid-PK shape of 20260401 only ever materialised on
-- databases created without the 20250404 migration.
--
-- Behaviour, by detected shape (fail-closed on anything unknown):
--   * text-PK shape already  -> verifies the PK and exits (no-op).
--   * uuid-PK shape          -> rebuilds the table in canonical shape,
--                               preserving every row, then recreates the
--                               index and the service_role_only policy.
--   * anything else          -> raises, changing nothing.
--
-- Sequencing: run only inside the production window, AFTER the three
-- pending migrations of 2026-11-12/13 are applied and verified (it
-- assumes increment_guest_usage exists). Idempotent: a second run sees
-- the canonical shape and no-ops.

-- Pre-condition (checked first, before touching anything): the RPC of
-- 20261112000001 must already be applied in this window's sequence.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'increment_guest_usage'
  ) THEN
    RAISE EXCEPTION 'increment_guest_usage missing: apply 20261112000001 before this convergence';
  END IF;
END $$;

DO $$
DECLARE
  has_id boolean;
  pk_on_guest_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guest_usage'
      AND column_name = 'id'
  ) INTO has_id;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'p' AND n.nspname = 'public'
      AND t.relname = 'guest_usage' AND a.attname = 'guest_id'
  ) INTO pk_on_guest_id;

  IF pk_on_guest_id AND NOT has_id THEN
    RAISE NOTICE 'guest_usage already in canonical shape (guest_id text PK); nothing to do';
    RETURN;
  END IF;

  IF has_id AND NOT pk_on_guest_id THEN
    -- uuid-PK shape: rebuild canonically, preserving rows.
    CREATE TABLE public.guest_usage_converged (
      guest_id text PRIMARY KEY,
      optimization_count integer NOT NULL DEFAULT 0,
      last_used_at timestamptz,
      last_mode text,
      last_provider text,
      created_at timestamptz DEFAULT now()
    );
    INSERT INTO public.guest_usage_converged
      (guest_id, optimization_count, last_used_at, last_mode, last_provider, created_at)
    SELECT guest_id, optimization_count, last_used_at, last_mode, last_provider, created_at
    FROM public.guest_usage;
    DROP TABLE public.guest_usage;
    ALTER TABLE public.guest_usage_converged RENAME TO guest_usage;
    CREATE INDEX IF NOT EXISTS idx_guest_usage_last_used
      ON public.guest_usage (last_used_at DESC);
    ALTER TABLE public.guest_usage ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_role_only" ON public.guest_usage;
    CREATE POLICY "service_role_only" ON public.guest_usage
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
    RAISE NOTICE 'guest_usage converged from uuid-PK shape to canonical text-PK shape';
    RETURN;
  END IF;

  RAISE EXCEPTION 'guest_usage has an unknown shape (has_id=%, pk_on_guest_id=%); refusing to converge', has_id, pk_on_guest_id;
END $$;
