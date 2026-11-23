'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart3, Clock, User, Zap } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/client/supabaseBrowser';
import { clearPromptPerfectLocalAuth } from '@/lib/client/ppUserSync';
import {
  NAV_PROFILE_UPDATED_EVENT,
  writeNavProfileCache,
} from '@/lib/client/navProfileCache';
import {
  fetchProfileFromApi,
  updateUserProfile,
  type ProfileLoadResult,
  type UserProfile,
  type UserStats,
} from '@/lib/client/userProfile';

function formatModeLabel(mode: string | null): string {
  if (!mode) return '—';
  const m = mode.toLowerCase();
  if (m === 'better') return 'Better';
  if (m === 'specific') return 'Specific';
  if (m === 'cot') return 'Chain-of-Thought';
  return mode;
}

function formatProviderLabel(p: string | null): string {
  if (!p) return '—';
  const x = p.toLowerCase();
  if (x === 'gemini') return 'Gemini';
  if (x === 'openai') return 'OpenAI';
  if (x === 'anthropic') return 'Anthropic';
  return p;
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats>({
    total: 0,
    favoriteMode: null,
    favoriteProvider: null,
    thumbsUp: 0,
    thumbsDown: 0,
  });
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  // Without a Supabase client there is nothing to load: start settled
  // so the "not configured" state renders immediately (EGM E4).
  const [loading, setLoading] = useState(() => supabase !== null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadHint, setLoadHint] = useState<string | null>(null);
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Applies a settled profile fetch. Every caller reaches this from
  // an async callback (the mount effect's .then, or load() after its
  // await), never synchronously from an effect body (EGM E4).
  const applyResult = useCallback((result: ProfileLoadResult) => {
    if (!result.ok) {
      const d = result.detail;
      // Only prompt for sign-in when we truly sent no credentials — not when the API rejected a 401 (e.g. misconfigured service key or stale id).
      if (d.code === 'NO_AUTH_HEADERS') {
        setNeedsSignIn(true);
        setLoading(false);
        return;
      }
      const codeSuffix = d.code ? ` [${d.code}]` : '';
      setLoadError(d.error + codeSuffix);
      setLoadHint(d.hint ?? null);
      setLoadErrorCode(d.code ?? null);
      setLoading(false);
      return;
    }

    setLoadErrorCode(null);
    setProfile(result.profile);
    setDisplayName(result.profile.display_name || '');
    setAvatarUrl(result.profile.avatar_url || '');
    setStats(result.stats);
    writeNavProfileCache(result.profile.id, {
      avatarUrl: result.profile.avatar_url ?? null,
      displayName: result.profile.display_name ?? null,
    });
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    if (!supabase) {
      return;
    }
    applyResult(await fetchProfileFromApi(supabase));
  }, [supabase, applyResult]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void fetchProfileFromApi(supabase).then((result) => {
      if (!cancelled) applyResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, applyResult]);

  const handleRetryLoad = () => {
    setLoadError(null);
    setLoadHint(null);
    setLoadErrorCode(null);
    setNeedsSignIn(false);
    setLoading(true);
    void load();
  };

  const handleResetAuth = async () => {
    await clearPromptPerfectLocalAuth(supabase);
    router.replace('/login');
  };

  const handleSignOut = async () => {
    await clearPromptPerfectLocalAuth(supabase);
    router.replace('/login');
  };

  const handleSave = async () => {
    if (!profile || !supabase) return;
    setSaveError(null);
    setSaving(true);
    try {
      const { error, profile: next } = await updateUserProfile(
        profile.id,
        {
          display_name: displayName.trim(),
          avatar_url: avatarUrl.trim() || null,
        },
        supabase,
      );

      if (error) {
        setSaveError(error.message);
        return;
      }

      if (next) {
        setProfile(next);
        setDisplayName(next.display_name || '');
        setAvatarUrl(next.avatar_url || '');
        writeNavProfileCache(next.id, {
          avatarUrl: next.avatar_url ?? null,
          displayName: next.display_name ?? null,
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(NAV_PROFILE_UPDATED_EVENT, {
              detail: {
                userId: next.id,
                avatar_url: next.avatar_url,
                display_name: next.display_name,
              },
            }),
          );
        }
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!supabase && !loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-center text-foreground-dim">
          Supabase is not configured. Add{' '}
          <code className="text-accent-text">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code className="text-accent-text">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-foreground-dim">Loading…</p>
      </div>
    );
  }

  if (needsSignIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="max-w-md text-center text-foreground-dim">
          We couldn’t load your profile because <strong className="text-foreground">this browser tab</strong> has no active sign-in. Profile only opens after you authenticate here (same device and browser where you use the app).
        </p>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Use <strong className="text-foreground-dim">Log in</strong> or{' '}
          <strong className="text-foreground-dim">Sign up</strong> below, then open Profile again—or go to the app, sign in from the header, then use the Profile link.
        </p>
        <Link
          href="/login"
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
        >
          Go to sign in
        </Link>
        <Link href="/app" className="text-sm text-muted-foreground hover:text-foreground-dim">
          Back to app
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="max-w-lg text-center text-red-400">{loadError}</p>
        {loadHint && (
          <p className="max-w-lg text-center text-sm text-muted-foreground">{loadHint}</p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={handleRetryLoad}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-card"
          >
            Retry
          </button>
          {loadErrorCode === 'AUTH_ADMIN_LOOKUP_FAILED' ? (
            <button
              type="button"
              onClick={() => void handleResetAuth()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              Sign out and sign in again
            </button>
          ) : null}
          <Link href="/app" className="text-sm text-accent-text hover:underline">
            Back to app
          </Link>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="text-foreground-dim">Could not load your profile.</p>
        <Link href="/app" className="text-accent-text hover:underline">
          Back to app
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Link
            href="/app"
            className="text-sm text-muted-foreground transition hover:text-foreground-dim"
          >
            ← Back to app
          </Link>
          {showSignOutConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground-dim">Sign out?</span>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
              >
                Sign Out
              </button>
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground-dim hover:bg-card"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSignOutConfirm(true)}
              className="text-sm text-muted-foreground transition hover:text-foreground-dim"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="mb-1 text-lg text-foreground-dim">
          Hi,{' '}
          <span className="text-foreground">
            {profile.display_name?.trim() ||
              profile.email.split('@')[0] ||
              'there'}
          </span>
        </p>
        <h1 className="mb-2 font-heading text-3xl font-bold text-foreground">
          Your profile
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          To edit: click <strong className="text-foreground-dim">Edit</strong> next to
          your name, change display name and/or avatar image URL, then{' '}
          <strong className="text-foreground-dim">Save</strong>.
        </p>

        {saveError && (
          <p className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
            {saveError}
          </p>
        )}

        <div className="mb-8 rounded-xl border border-border bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-supplied arbitrary URL
              <img
                src={profile.avatar_url}
                alt=""
                className="mx-auto h-20 w-20 shrink-0 rounded-full object-cover sm:mx-0"
              />
            ) : (
              <div className="mx-auto flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-accent/20 sm:mx-0">
                <User className="h-10 w-10 text-accent-text" strokeWidth={1} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Display name
                    </label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Avatar URL
                    </label>
                    <input
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://…"
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-[#52525b] focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setSaveError(null);
                        setDisplayName(profile.display_name || '');
                        setAvatarUrl(profile.avatar_url || '');
                      }}
                      className="rounded-lg border border-border px-4 py-2 text-sm text-foreground-dim hover:bg-card"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2 className="font-heading text-xl font-semibold text-foreground">
                      {profile.display_name || '—'}
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(true);
                        setSaveError(null);
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground-dim"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-foreground-dim">{profile.email || '—'}</p>
                  {profile.created_at && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Member since{' '}
                      {new Date(profile.created_at).toLocaleDateString('en-US', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                  <p className="mt-3 text-sm text-foreground-dim">
                    <span className="font-medium text-foreground">
                      {profile.optimization_count}
                    </span>{' '}
                    optimizations saved to your account
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">
          Account overview
        </h2>
        {stats.total === 0 ? (
          <div className="rounded-xl border border-border bg-gradient-to-b from-white/[0.04] to-white/[0.01] py-12 text-center">
            <BarChart3
              className="mx-auto mb-4 h-10 w-10 text-[#333333]"
              strokeWidth={1}
            />
            <p className="text-sm text-muted-foreground">
              Start optimizing prompts to see your stats here!
            </p>
            <Link
              href="/app"
              className="mt-4 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
            >
              Optimize a prompt
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6 text-center">
              <BarChart3
                className="mx-auto mb-2 h-8 w-8 text-accent-text"
                strokeWidth={1}
              />
              <p className="font-heading text-2xl font-bold text-foreground">
                {stats.total}
              </p>
              <p className="text-sm text-foreground-dim">Total optimizations</p>
            </div>
            <div className="rounded-xl border border-border bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6 text-center">
              <Zap className="mx-auto mb-2 h-8 w-8 text-accent-text" strokeWidth={1} />
              <p className="font-heading text-2xl font-bold text-foreground">
                {formatModeLabel(stats.favoriteMode)}
              </p>
              <p className="text-sm text-foreground-dim">Favorite mode</p>
            </div>
            <div className="rounded-xl border border-border bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6 text-center">
              <Clock className="mx-auto mb-2 h-8 w-8 text-accent-text" strokeWidth={1} />
              <p className="font-heading text-2xl font-bold text-foreground">
                {formatProviderLabel(stats.favoriteProvider)}
              </p>
              <p className="text-sm text-foreground-dim">Most-used provider</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
