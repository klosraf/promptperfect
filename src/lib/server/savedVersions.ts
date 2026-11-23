/**
 * Immutable version snapshots for saved prompts.
 *
 * The versions table ships as a prepared migration (production window),
 * so every helper here is fail-soft: a missing table is detected from
 * the PostgREST error shape — the same idiom the saved-prompts route
 * already uses — and reported as `available: false` instead of an
 * error. Edits and restores keep working without snapshotting until
 * the table exists.
 */

export interface SavedPromptSnapshotSource {
  id: string;
  user_id: string;
  title: string;
  original_prompt: string;
  optimized_prompt: string;
  explanation: string;
  mode: string;
  provider: string;
}

export interface SavedPromptVersion {
  id: string;
  saved_prompt_id: string;
  version: number;
  title: string;
  original_prompt: string;
  optimized_prompt: string;
  explanation: string;
  mode: string;
  provider: string;
  created_at: string;
}

const MISSING_TABLE_RE = /does not exist|could not find|schema cache|42P01/i;

export function isMissingTableError(error: { message?: string } | null): boolean {
  return !!error?.message && MISSING_TABLE_RE.test(error.message);
}

import type { SupabaseClient } from '@supabase/supabase-js';

type Db = SupabaseClient;

/**
 * Snapshot the current state of a saved prompt as its next version.
 * Returns true when the snapshot was written, false when the versions
 * table is not there yet (the caller proceeds regardless).
 */
export async function snapshotSavedPrompt(
  db: Db,
  row: SavedPromptSnapshotSource,
): Promise<boolean> {
  const latest = await db
    .from('pp_saved_prompt_versions')
    .select('version')
    .eq('saved_prompt_id', row.id)
    .order('version', { ascending: false })
    .limit(1);
  if (latest.error) {
    if (isMissingTableError(latest.error)) return false;
    return false;
  }
  const nextVersion =
    Array.isArray(latest.data) && latest.data.length > 0
      ? Number(latest.data[0]?.version ?? 0) + 1
      : 1;
  const inserted = await db.from('pp_saved_prompt_versions').insert({
    saved_prompt_id: row.id,
    user_id: row.user_id,
    version: nextVersion,
    title: row.title,
    original_prompt: row.original_prompt,
    optimized_prompt: row.optimized_prompt,
    explanation: row.explanation,
    mode: row.mode,
    provider: row.provider,
  });
  return !inserted.error;
}

export async function listSavedPromptVersions(
  db: Db,
  userId: string,
  savedPromptId: string,
): Promise<{ available: boolean; versions: SavedPromptVersion[] }> {
  const res = await db
    .from('pp_saved_prompt_versions')
    .select(
      'id,saved_prompt_id,version,title,original_prompt,optimized_prompt,explanation,mode,provider,created_at',
    )
    .eq('saved_prompt_id', savedPromptId)
    .eq('user_id', userId)
    .order('version', { ascending: false });
  if (res.error) {
    if (isMissingTableError(res.error)) return { available: false, versions: [] };
    return { available: false, versions: [] };
  }
  return { available: true, versions: (res.data ?? []) as SavedPromptVersion[] };
}
