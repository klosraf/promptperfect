-- Remediation F2-08/F3-01 (step 2 of 2): guard pp_users.api_key against any
-- future plaintext write (ADR-0010).
--
-- LOCATION: this file deliberately lives OUTSIDE supabase/migrations/ so no
-- chain run can apply it by accident. On execution day, after the window
-- closes, move it into supabase/migrations/ and apply it there; the DO block
-- below additionally refuses to run while the step-1 seat is < 14 days old.
--
-- Apply ONLY after step 1 (20261113000000) AND after the observation window
-- in docs/audits/REMEDIACION-BYOK-2026-11-13.md closes with a verified count
-- of zero new non-empty writes. Applying it while old code is still deployed
-- makes that code's settings saves fail (its UPDATE carries the key).
--
-- Rollback (only via the named procedure in the remediation report):
--   ALTER TABLE public.pp_users
--     DROP CONSTRAINT IF EXISTS pp_users_api_key_must_be_empty;
--
-- Idempotent: guarded by pg_constraint lookup. The migration runner wraps
-- this file in its own transaction.

DO $$
DECLARE
  seat_at timestamptz;
BEGIN
  -- Mechanical interlock (not just a warning): refuse to apply until the
  -- step-1 seat is at least 14 days old, i.e. the observation window in the
  -- runbook has actually elapsed. Failing here rolls the migration back and
  -- leaves it pending; retry after the window closes.
  SELECT min(executed_at) INTO seat_at
  FROM public.pp_users_api_key_remediation
  WHERE check_name = 'pp_users_api_key_nonempty_v1';
  IF seat_at IS NULL OR seat_at > now() - interval '14 days' THEN
    RAISE EXCEPTION 'BYOK guard refused: observation window not closed (step-1 seat missing or younger than 14 days)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pp_users_api_key_must_be_empty'
      AND conrelid = 'public.pp_users'::regclass
      AND contype = 'c'
  ) THEN
    ALTER TABLE public.pp_users
      ADD CONSTRAINT pp_users_api_key_must_be_empty
      CHECK (api_key IS NULL OR api_key = '');
  END IF;
END $$;
