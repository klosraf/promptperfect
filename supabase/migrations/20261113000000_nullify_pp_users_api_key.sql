-- Remediation F2-08/F3-01 (step 1 of 2): nullify the plaintext BYOK stock in
-- pp_users.api_key (ADR-0010). The server no longer persists user API keys;
-- this migration removes the stock written before the code change.
--
-- Count-only audit seat: this file never selects, returns, or prints a key
-- value. The seat records how many rows held a non-empty key, once, so the
-- affected-user notification step in the runbook has a verifiable denominator.
--
-- Idempotent: a re-run with no new stock changes nothing and adds no seat.
-- A re-run after new stock appeared (e.g. a code rollback re-enabled the
-- writer) nullifies it and seats that execution separately, so the seat
-- always sums to every row ever nullified.
-- The migration runner wraps this file in its own transaction.
-- Step 2 (the CHECK guard) is 20261113000001, applied only after the
-- observation window defined in docs/audits/REMEDIACION-BYOK-2026-11-13.md.

CREATE TABLE IF NOT EXISTS public.pp_users_api_key_remediation (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  executed_at timestamptz NOT NULL DEFAULT now(),
  affected_rows integer NOT NULL,
  check_name text NOT NULL DEFAULT 'pp_users_api_key_nonempty_v1',
  expected_post_state text NOT NULL DEFAULT 'zero_nonempty'
);

ALTER TABLE public.pp_users_api_key_remediation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_users_api_key_remediation FORCE ROW LEVEL SECURITY;
-- Revoke from the Supabase API roles when they exist (a bare Postgres has
-- neither role; Supabase always has both). RLS above is already forced with
-- no policies, so API roles are denied regardless.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.pp_users_api_key_remediation FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.pp_users_api_key_remediation FROM authenticated;
  END IF;
END $$;

-- Single statement: the seat count is exactly the number of rows this
-- UPDATE nullifies (same predicate, same snapshot), so a concurrent writer
-- cannot slip stock between the count and the nullification. The runner
-- wraps the whole file in one transaction.
WITH nulled AS (
  UPDATE public.pp_users
  SET api_key = NULL
  WHERE api_key IS NOT NULL AND api_key <> ''
  RETURNING 1
)
INSERT INTO public.pp_users_api_key_remediation (affected_rows)
SELECT s.c FROM (SELECT count(*) AS c FROM nulled) AS s
WHERE s.c > 0 OR NOT EXISTS (
  SELECT 1 FROM public.pp_users_api_key_remediation
  WHERE check_name = 'pp_users_api_key_nonempty_v1'
);
