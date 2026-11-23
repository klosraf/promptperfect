import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/auth/rateLimit';
import {
  getDbForIdentity,
  jsonUnauthorizedDetails,
  resolveIdentity,
} from '@/lib/server/supabaseRequestIdentity';
import {
  listSavedPromptVersions,
  snapshotSavedPrompt,
} from '@/lib/server/savedVersions';
import { logWarn } from '@/lib/logger';

const SELECT_SAVED =
  'id,title,original_prompt,optimized_prompt,explanation,mode,provider,created_at';

/**
 * Version history for one saved prompt. Fail-soft by design: until the
 * prepared migration creates pp_saved_prompt_versions, GET answers
 * { available: false, versions: [] } and restores answer 503 with the
 * same flag, so the library UI can hide the feature instead of erroring.
 */
export async function GET(request: Request) {
  const limited = enforceRateLimit('saved-prompts', request, 60);
  if (limited) return limited;

  const identity = await resolveIdentity(request);
  if (!identity) {
    return NextResponse.json(await jsonUnauthorizedDetails(request), {
      status: 401,
    });
  }
  const db = getDbForIdentity(identity);
  if (!db) {
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 503 },
    );
  }

  const savedId = new URL(request.url).searchParams.get('savedId')?.trim() ?? '';
  if (!savedId) {
    return NextResponse.json(
      { error: 'savedId is required' },
      { status: 400 },
    );
  }

  const { available, versions } = await listSavedPromptVersions(
    db,
    identity.userId,
    savedId,
  );
  return NextResponse.json({ available, versions });
}

export async function POST(request: Request) {
  const limited = enforceRateLimit('saved-prompts-write', request, 30);
  if (limited) return limited;

  const identity = await resolveIdentity(request);
  if (!identity) {
    return NextResponse.json(await jsonUnauthorizedDetails(request), {
      status: 401,
    });
  }
  const db = getDbForIdentity(identity);
  if (!db) {
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const savedId =
    typeof body?.savedId === 'string' ? body.savedId.trim() : '';
  const versionId =
    typeof body?.versionId === 'string' ? body.versionId.trim() : '';
  if (!savedId || !versionId) {
    return NextResponse.json(
      { error: 'savedId and versionId are required' },
      { status: 400 },
    );
  }

  const { data: version, error: versionError } = await db
    .from('pp_saved_prompt_versions')
    .select(
      'id,saved_prompt_id,version,title,original_prompt,optimized_prompt,explanation,mode,provider,created_at',
    )
    .eq('id', versionId)
    .eq('saved_prompt_id', savedId)
    .eq('user_id', identity.userId)
    .maybeSingle();
  if (versionError) {
    const missing = /does not exist|could not find|schema cache|42P01/i.test(
      versionError.message ?? '',
    );
    return NextResponse.json(
      { error: 'Version history is not available yet', available: false },
      { status: missing ? 503 : 500 },
    );
  }
  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  const { data: live, error: liveError } = await db
    .from('pp_saved_prompts')
    .select(
      'id,user_id,title,original_prompt,optimized_prompt,explanation,mode,provider',
    )
    .eq('id', savedId)
    .eq('user_id', identity.userId)
    .maybeSingle();
  if (liveError || !live) {
    if (liveError) logWarn('saved-versions', `load failed: ${liveError.message}`);
    return NextResponse.json(
      { error: 'Saved prompt not found' },
      { status: liveError ? 500 : 404 },
    );
  }

  // Restoring is itself an edit: snapshot the live row first so the
  // restore can be undone by restoring the snapshot it creates.
  const versioned = await snapshotSavedPrompt(db, live);

  const { data: updated, error: updateError } = await db
    .from('pp_saved_prompts')
    .update({
      title: version.title,
      original_prompt: version.original_prompt,
      optimized_prompt: version.optimized_prompt,
      explanation: version.explanation,
      mode: version.mode,
      provider: version.provider,
      updated_at: new Date().toISOString(),
    })
    .eq('id', savedId)
    .eq('user_id', identity.userId)
    .select(SELECT_SAVED)
    .maybeSingle();
  if (updateError || !updated) {
    if (updateError)
      logWarn('saved-versions', `restore failed: ${updateError.message}`);
    return NextResponse.json(
      { error: 'Could not restore the version' },
      { status: 500 },
    );
  }

  return NextResponse.json({ restored: true, versioned, prompt: updated });
}
