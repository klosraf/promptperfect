-- 20261123000001_saved_prompt_versions.sql  (PREPARED — not in migrations/)
--
-- Immutable version history for the prompt library: every edit or
-- restore of a saved prompt first snapshots the current row here.
-- Versions are append-only from the API (no update/delete endpoints
-- exist for them); deleting the saved prompt cascades its versions.
--
-- Sequencing: apply inside the production window, after the pending
-- migrations of 2026-11-12/13. The API is fail-soft until then: it
-- detects this table's absence and reports versions as unavailable
-- while edits keep working without snapshotting (the same pattern as
-- the guest-usage RPC fallback).

CREATE TABLE IF NOT EXISTS public.pp_saved_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_prompt_id uuid NOT NULL
    REFERENCES public.pp_saved_prompts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  original_prompt text NOT NULL,
  optimized_prompt text NOT NULL DEFAULT '',
  explanation text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'better',
  provider text NOT NULL DEFAULT 'gemini',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (saved_prompt_id, version)
);

CREATE INDEX IF NOT EXISTS idx_pp_saved_prompt_versions_prompt_version
  ON public.pp_saved_prompt_versions (saved_prompt_id, version DESC);

ALTER TABLE public.pp_saved_prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp_saved_prompt_versions_select_own"
  ON public.pp_saved_prompt_versions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "pp_saved_prompt_versions_insert_own"
  ON public.pp_saved_prompt_versions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pp_saved_prompt_versions_update_own"
  ON public.pp_saved_prompt_versions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "pp_saved_prompt_versions_delete_own"
  ON public.pp_saved_prompt_versions FOR DELETE
  USING (auth.uid() = user_id);
