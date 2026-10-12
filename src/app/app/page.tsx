'use client';

import type { User } from '@supabase/supabase-js';
import { useCompletion } from '@ai-sdk/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PromptInput } from '@/components/PromptInput';
import { AppModeSelector } from '@/components/AppModeSelector';
import { StreamingPromptOutput } from '@/components/StreamingPromptOutput';
import { ExplanationPanel } from '@/components/ExplanationPanel';
import { HistoryPanel } from '@/components/HistoryPanel';
import type { OptimizationHistoryItem } from '@/lib/historyMerge';
import {
  explanationTextFromFullCompletion,
  getOrCreateSessionId,
  optimizedTextFromFullCompletion,
  saveToHistory,
} from '@/lib/client/optimizationHistory';
import { RunActions } from '@/components/workspace/RunActions';
import { TranslateButton } from '@/components/TranslateButton';
import { StatsBar } from '@/components/StatsBar';
import { AppSettingsPanel } from '@/components/AppSettingsPanel';
import { DemoTokenBar } from '@/components/DemoTokenBar';
import { DemoLimitModal } from '@/components/DemoLimitModal';
import { ProjectLinker } from '@/components/ProjectLinker';
import { SignInRequiredModal } from '@/components/SignInRequiredModal';
import {
  GUEST_TOKEN_LIMIT,
  getGuestId,
  setGuestCount,
  incrementGuestCount,
  decrementGuestCount,
  isGuestLimitReached,
} from '@/lib/guest';
import { useOptimisticThumbs } from '@/hooks/useOptimisticThumbs';
import { useLibraryStatus } from '@/hooks/useLibraryStatus';
import { useGuestUsageSync } from '@/hooks/useGuestUsageSync';
import { isUnlimitedMode } from '@/lib/localMode';
import type { OptimizationMode, Provider } from '@/lib/types';
import { createSupabaseBrowserClient } from '@/lib/client/supabaseBrowser';
import {
  buildAppUserFromSupabaseUser,
  loadApiKey,
  readEnginePrefs,
} from '@/lib/client/enginePrefsStorage';
import {
  persistEnginePrefsFromAuthUser,
  resolveAuthUserAndSession,
} from '@/lib/client/ppUserSync';
import { claimGuestHistoryAfterAuth } from '@/lib/client/claimGuestHistory';
import { wipeBrowserSupabaseSession } from '@/lib/client/supabaseBrowserSessionWipe';
import { readStatsBarCache } from '@/lib/client/statsBarCache';
import { userFacingOptimizeError } from '@/lib/optimizeUserError';
import {
  CHANGES_DELIMITER,
  EXPLANATION_DELIMITER,
} from '@/lib/delimiter';
import { UserAccountMenu } from '@/components/UserAccountMenu';
import { ClientErrorBoundary } from '@/components/ClientErrorBoundary';
import {
  FEEDBACK_MODES,
  modeFromHistoryRow,
} from '@/lib/modes';

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface PPUser {
  id: string;
  name: string | null;
  email: string;
  provider: string;
  model: string;
}

export default function AppPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<PPUser | null>(null);
  const [inputText, setInputText] = useState('');
  const [selectedMode, setSelectedMode] = useState<OptimizationMode>('better');
  const [provider, setProvider] = useState<Provider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [explanation, setExplanation] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [runMeta, setRunMeta] = useState<{
    mode: OptimizationMode;
    provider: Provider;
    inputLength: number;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsRefresh, setStatsRefresh] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [selectedHistoryItem, setSelectedHistoryItem] =
    useState<OptimizationHistoryItem | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [guestUsageVersion, setGuestUsageVersion] = useState(0);
  const [usageGateError, setUsageGateError] = useState<string | null>(null);
  const optimizeContextRef = useRef({ mode: 'better' as OptimizationMode });
  const optimizeSessionIdRef = useRef<string | null>(null);
  const userRef = useRef<PPUser | null>(null);
  const selectedHistoryItemRef = useRef<OptimizationHistoryItem | null>(null);
  const historyIdRef = useRef<string | null>(null);

  /** Optimistic thumbs overlay (history refreshes now, stats on a delay cascade). */
  const {
    thumbOptimistic,
    handleStatsThumbsSynced,
    handleFeedbackSubmitted,
    seedServerThumbs,
  } = useOptimisticThumbs({
      onStatsRefresh: useCallback(() => {
        setStatsRefresh((n) => n + 1);
      }, []),
      onHistoryRefresh: useCallback(() => {
        setHistoryRefresh((n) => n + 1);
      }, []),
    });

  /** Set to true when arriving from library "Re-optimize" — consumed by auto-trigger below. */
  const pendingAutoOptimizeRef = useRef(false);
  const pendingAutoRunRef = useRef(false);
  /** Always holds the latest handleOptimize to avoid stale-closure issues in the auto-trigger. */
  const handleOptimizeRef = useRef<(() => Promise<void>) | null>(null);

  const [syncCompletion, setSyncCompletion] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !mounted) return;
    const raw = sessionStorage.getItem('pp_reoptimize');
    if (!raw) return;
    sessionStorage.removeItem('pp_reoptimize');
    try {
      const o = JSON.parse(raw) as { text?: string; mode?: string; autoOptimize?: boolean };
      if (typeof o.text === 'string' && o.text.trim()) setInputText(o.text);
      if (o.mode && (FEEDBACK_MODES as readonly string[]).includes(o.mode)) {
        setSelectedMode(o.mode as OptimizationMode);
      }
      if (o.autoOptimize) pendingAutoOptimizeRef.current = true;
    } catch {
      // swallow: invalid reoptimize payload
    }
  }, [mounted]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    selectedHistoryItemRef.current = selectedHistoryItem;
  }, [selectedHistoryItem]);

  useEffect(() => {
    historyIdRef.current = historyId;
  }, [historyId]);

  /** Align feedback baseline with cached analytics when remounting /app after visiting other routes. */
  useEffect(() => {
    const uid = user?.id?.trim();
    if (!uid) return;
    const c = readStatsBarCache(uid);
    if (c) {
      seedServerThumbs(c.thumbsUp, c.thumbsDown);
    }
  }, [user?.id, seedServerThumbs]);

  const providerRef = useRef(provider);
  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  useEffect(() => {
    if (!mounted) return;
    const client = createSupabaseBrowserClient();
    if (!client) {
      setUser(null);
      setProvider('gemini');
      setApiKey('');
      setHydrated(true);
      return;
    }

    const applyAuthUser = (authUser: User | null) => {
      if (!authUser?.id) {
        setUser(null);
        const p = (readEnginePrefs()?.provider as Provider) || 'gemini';
        setProvider(p);
        setApiKey(loadApiKey(p));
        setHydrated(true);
        return;
      }
      persistEnginePrefsFromAuthUser();
      const prefs = readEnginePrefs();
      const u = buildAppUserFromSupabaseUser(authUser, prefs) as PPUser;
      setUser(u);
      setProvider((u.provider as Provider) || 'gemini');
      setApiKey(loadApiKey((u.provider as Provider) || 'gemini'));
      setHydrated(true);
    };

    void resolveAuthUserAndSession(client)
      .then(({ user }) => {
        applyAuthUser(user);
      })
      .catch(() => {
        setUser(null);
        setHydrated(true);
      });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      applyAuthUser(session?.user ?? null);
      if (event === 'SIGNED_IN' && session?.user) {
        void claimGuestHistoryAfterAuth();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [mounted]);

  // Merge the server-side guest counter once the app hydrates (guests only).
  const bumpGuestUsageVersion = useCallback(
    () => setGuestUsageVersion((v) => v + 1),
    [],
  );
  useGuestUsageSync({
    mounted,
    hydrated,
    userId: user?.id,
    onSynced: bumpGuestUsageVersion,
  });

  useEffect(() => {
    setApiKey(loadApiKey(provider));
  }, [provider]);

  useEffect(() => {
    optimizeContextRef.current.mode = selectedMode;
  }, [selectedMode]);

  /** Whether this history row is already in the library (server). */
  const [inLibrary, setInLibrary] = useLibraryStatus(user?.id, historyId);

  useEffect(() => {
    const open = () => setSettingsOpen(true);
    document.addEventListener('open-settings', open);
    return () => document.removeEventListener('open-settings', open);
  }, []);

  const hasApiKey = typeof apiKey === 'string' && apiKey.trim() !== '';

  const {
    completion: streamCompletion,
    complete,
    setCompletion: setStreamCompletion,
    isLoading: streamLoading,
    error: streamError,
  } = useCompletion({
    api: '/api/optimize',
    streamProtocol: 'text',
    body: {
      mode: selectedMode,
      provider,
    },
    onFinish: async (prompt, completion) => {
      const u = userRef.current;
      const authed = !!u;
      const histId = await saveToHistory({
        prompt_original: prompt.trim(),
        prompt_optimized: optimizedTextFromFullCompletion(completion),
        mode: optimizeContextRef.current.mode,
        explanation: explanationTextFromFullCompletion(completion),
        sessionId: authed ? getOrCreateSessionId() : getGuestId(),
        userId: u?.id,
        provider: providerRef.current,
        optimizeSessionId: optimizeSessionIdRef.current ?? undefined,
      });
      setHistoryId(histId);
      /** Refresh stats/history after the row exists so thumbs aggregate includes this session. */
      setStatsRefresh((n) => n + 1);
      setHistoryRefresh((n) => n + 1);
    },
    fetch: async (input, init) => {
      const res = await fetch(input, init);
      if (!res.ok) {
        let msg = `Request failed: ${res.status}`;
        try {
          const text = await res.text();
          const data = text
            ? (JSON.parse(text) as { error?: string; message?: string })
            : {};
          if (typeof data?.error === 'string' && data.error.trim()) msg = data.error.trim();
          else if (typeof data?.message === 'string' && data.message.trim())
            msg = data.message.trim();
        } catch {
          // swallow: prefer upstream error message when parsing fails
        }
        throw new Error(msg);
      }
      return res;
    },
    onError: () => {
      // Refund the optimistic guest reservation: failed runs must not burn quota.
      if (!userRef.current) {
        decrementGuestCount();
        setGuestUsageVersion((v) => v + 1);
      }
    },
  });

  const isGemini = provider === 'gemini';
  const completion = isGemini ? streamCompletion : syncCompletion;
  const isLoading = isGemini ? streamLoading : syncLoading;
  const error = isGemini ? streamError : syncError ? new Error(syncError) : null;

  const handleOptimize = useCallback(async () => {
    if (!inputText.trim()) return;
    setUsageGateError(null);

    // Unlimited local-dev mode: no quota gate, no server tracking, no counting.
    if (!user && !isUnlimitedMode()) {
      if (isGuestLimitReached()) {
        setShowLimitModal(true);
        return;
      }

      const guestId = getGuestId();
      const res = await fetch('/api/guest-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId,
          mode: selectedMode,
          provider,
        }),
      });

      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as {
          count?: number;
        };
        // Sync local counter with server's confirmed count so the bar reflects reality.
        if (typeof body.count === 'number') {
          setGuestCount(body.count);
        } else {
          // 429 means limit is reached — ensure local state reflects that.
          setGuestCount(GUEST_TOKEN_LIMIT);
        }
        setGuestUsageVersion((v) => v + 1);
        setShowLimitModal(true);
        return;
      }

      // For any server-side failure (503 = DB not configured, 500 = upsert error, etc.)
      // fall through to optimistic local tracking so guests aren't blocked by infra issues.
      const data = res.ok
        ? ((await res.json().catch(() => ({}))) as { count?: number; persisted?: boolean })
        : {};

      // Always increment locally by at least 1; use server count only when it's higher.
      // This prevents the counter from sticking at 1 if the server DB is unavailable.
      const localNext = incrementGuestCount();
      if (typeof data.count === 'number' && data.count > localNext) {
        setGuestCount(data.count);
      }
      setGuestUsageVersion((v) => v + 1);
    }

    const sid = generateSessionId();
    optimizeSessionIdRef.current = sid;
    const trimmed = inputText.trim();
    optimizeContextRef.current.mode = selectedMode;
    setExplanation('');
    setSessionId(sid);
    setSelectedHistoryItem(null);
    setHistoryId(null); // Reset history ID for new optimization
    setRunMeta({ mode: selectedMode, provider, inputLength: trimmed.length });

    const coreBody = {
      text: trimmed,
      prompt: trimmed,
      mode: selectedMode,
      provider,
      session_id: sid,
    };

    if (isGemini) {
      void complete(trimmed, {
        body: {
          ...coreBody,
          apiKey: undefined,
        },
      });
    } else {
      setSyncError(null);
      setSyncLoading(true);
      setSyncCompletion('');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (hasApiKey) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
      }
      fetch('/api/optimize-sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...coreBody,
          ...(hasApiKey ? { apiKey: apiKey.trim() } : {}),
        }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (data.error) throw new Error(data.error);
          return data as {
            optimizedText?: string;
            explanation?: string;
            changes?: string;
            rawText?: string;
          };
        })
        .then(async (data) => {
          const { optimizedText, explanation: expl, changes } = data;
          const full =
            (optimizedText ?? '') +
            (expl ? `\n${EXPLANATION_DELIMITER}\n${expl}` : '') +
            (changes ? `\n${CHANGES_DELIMITER}\n${changes}` : '');
          setSyncCompletion(full);
          setExplanation(expl || '');
          const histId = await saveToHistory({
            prompt_original: trimmed,
            prompt_optimized: (optimizedText ?? '').trim(),
            mode: selectedMode,
            explanation: (expl ?? '').trim(),
            sessionId: user ? getOrCreateSessionId() : getGuestId(),
            userId: user?.id,
            provider,
            optimizeSessionId: sid,
          });
          setHistoryId(histId);
          setStatsRefresh((n) => n + 1);
          setHistoryRefresh((n) => n + 1);
        })
        .catch((err) => {
          // Refund the optimistic guest reservation: failed runs must not burn quota.
          if (!user) {
            decrementGuestCount();
            setGuestUsageVersion((v) => v + 1);
          }
          setSyncError(err instanceof Error ? err.message : 'Request failed');
        })
        .finally(() => setSyncLoading(false));
    }
  }, [user, inputText, selectedMode, provider, apiKey, hasApiKey, isGemini, complete]);

  // Keep ref in sync every render so the auto-trigger always calls the latest version.
  handleOptimizeRef.current = handleOptimize;

  // Auto-trigger: fires when arriving from library "Re-optimize".
  // Waits for both hydrated AND user so the history row is saved with user_id.
  useEffect(() => {
    if (!hydrated || !user || !pendingAutoOptimizeRef.current || !inputText.trim() || isLoading) return;
    pendingAutoOptimizeRef.current = false;
    void handleOptimizeRef.current?.();
  }, [hydrated, user, inputText, isLoading]);

  // Auto-trigger: fires after "Link project directory" builds a digest.
  // Works for guests too (no user required) — mirrors the pattern above.
  useEffect(() => {
    if (!hydrated || !pendingAutoRunRef.current || !inputText.trim() || isLoading) return;
    pendingAutoRunRef.current = false;
    void handleOptimizeRef.current?.();
  }, [hydrated, inputText, isLoading]);

  const resetComposerToNewPrompt = useCallback(() => {
    setSelectedHistoryItem(null);
    setHistoryId(null);
    setSessionId(null);
    setRunMeta(null);
    optimizeSessionIdRef.current = null;
    setSelectedMode('better');
    setInputText('');
    setExplanation('');
    setInLibrary(null);
    setSyncError(null);
    setSyncLoading(false);
    setUsageGateError(null);
    if (isGemini) {
      setStreamCompletion('');
    } else {
      setSyncCompletion('');
    }
  }, [isGemini, setStreamCompletion, setInLibrary]);

  // "Link project directory" flow: load the digest as input, switch to the
  // Production Audit mode, and auto-run via pendingAutoRunRef.
  const handleProjectDigest = useCallback(
    (digest: string) => {
      resetComposerToNewPrompt();
      setInputText(digest);
      setSelectedMode('production');
      pendingAutoRunRef.current = true;
    },
    [resetComposerToNewPrompt],
  );

  // "Fix & re-run" flow: append the remediation directives to the current
  // input and auto-run. handleOptimize resets run state for the new run.
  const handleRemediate = useCallback((directiveBlock: string) => {
    if (!directiveBlock.trim()) return;
    setInputText((prev) => `${prev.trimEnd()}${directiveBlock}`);
    pendingAutoRunRef.current = true;
  }, []);

  // Output translation: swap the whole completion (markers preserved by the
  // translator) and re-derive the explanation. Treated as a fresh unsaved run.
  const handleTranslateOutput = useCallback(
    (translatedFullText: string) => {
      setSelectedHistoryItem(null);
      setHistoryId(null);
      setExplanation(explanationTextFromFullCompletion(translatedFullText));
      if (isGemini) {
        setStreamCompletion(translatedFullText);
      } else {
        setSyncCompletion(translatedFullText);
      }
    },
    [isGemini, setStreamCompletion],
  );

  const handleHistorySelect = useCallback(
    (item: OptimizationHistoryItem) => {
      if (selectedHistoryItemRef.current?.id === item.id) {
        resetComposerToNewPrompt();
        return;
      }

      setSelectedHistoryItem(item);
      setHistoryId(item.id); // Share + Save + library status use history row id
      /** Prefer per-run optimize id for logs; legacy rows use history id so feedback works without re-running Optimize. */
      const feedbackSessionId =
        item.optimize_session_id?.trim() || item.id.trim() || null;
      setSessionId(feedbackSessionId);
      setRunMeta({
        mode: modeFromHistoryRow(item.mode),
        provider,
        inputLength: item.prompt_original.trim().length,
      });
      setSelectedMode(modeFromHistoryRow(item.mode));
      const full =
        item.prompt_optimized +
        (item.explanation.trim()
          ? `\n${EXPLANATION_DELIMITER}\n${item.explanation.trim()}`
          : '');
      setInputText(item.prompt_original);
      setExplanation(item.explanation || '');
      if (isGemini) {
        setStreamCompletion(full);
      } else {
        setSyncCompletion(full);
      }
    },
    [isGemini, provider, resetComposerToNewPrompt, setStreamCompletion],
  );

  const handleHistoryDeleted = useCallback((deletedId: string) => {
    setHistoryRefresh((n) => n + 1);
    setStatsRefresh((n) => n + 1);
    if (selectedHistoryItemRef.current?.id === deletedId) {
      setSelectedHistoryItem(null);
      setSessionId(null);
    }
    setHistoryId((hid) => (hid === deletedId ? null : hid));
    if (historyIdRef.current === deletedId) {
      setInLibrary(false);
    }
  }, [setInLibrary]);

  const handleLogout = async () => {
    setSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } finally {
      try {
        localStorage.removeItem('pp_ui_theme');
      } catch {
        // swallow: theme/storage cleanup is best-effort
      }
      wipeBrowserSupabaseSession();
      setSigningOut(false);
      setUser(null);
      router.push('/login');
    }
  };

  if (!mounted || !hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#050505]">
        <div className="text-[#ECECEC]">Loading…</div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex min-h-screen w-full flex-col bg-[#050505] font-sans${user ? ' md:pr-72' : ''}`}
    >
      <header className="fixed left-0 right-0 top-0 z-40 flex h-14 shrink-0 items-center border-b border-[#1a1a1a] bg-[#050505]/95 backdrop-blur-sm">
        <div className="flex w-full min-w-0 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex shrink-0 items-baseline gap-2 font-heading"
          >
            <span className="text-lg font-bold tracking-tight text-[#E7E6D9]">
              PromptPerfect
            </span>
            <span className="text-sm text-[#71717A]">by Beagle</span>
          </Link>
          <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
            {user ? (
              <>
                <Link
                  href="/library"
                  className="rounded-lg border border-transparent px-3 py-1.5 text-sm text-[#888] transition-all duration-200 ease-out hover:border-[#2a2a2a] hover:bg-[#111] hover:text-[#ECECEC]"
                >
                  Library
                </Link>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-lg border border-transparent px-3 py-1.5 text-sm text-[#888] transition-all duration-200 ease-out hover:border-[#2a2a2a] hover:bg-[#111] hover:text-[#ECECEC]"
                  aria-label="Settings"
                >
                  ⚙️ Settings
                </button>
                <UserAccountMenu
                  key={user.id}
                  userId={user.id}
                  fallbackDisplayName={
                    user.name?.trim() ||
                    user.email.split('@')[0] ||
                    user.email ||
                    'there'
                  }
                  onLogout={handleLogout}
                  signingOut={signingOut}
                />
              </>
            ) : (
              <>
                {isUnlimitedMode() ? (
                  <Link
                    href="/library"
                    className="rounded-lg border border-transparent px-3 py-1.5 text-sm text-[#888] transition-all duration-200 ease-out hover:border-[#2a2a2a] hover:bg-[#111] hover:text-[#ECECEC]"
                  >
                    Library
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSignInModal(true)}
                    className="rounded-lg border border-transparent px-3 py-1.5 text-sm text-[#888] transition-all duration-200 ease-out hover:border-[#2a2a2a] hover:bg-[#111] hover:text-[#ECECEC]"
                  >
                    Library
                  </button>
                )}
                <Link
                  href="/login"
                  className="rounded-lg border border-transparent px-3 py-1.5 text-sm text-[#888] transition-all duration-200 ease-out hover:border-[#2a2a2a] hover:bg-[#111] hover:text-[#ECECEC]"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-[#4552FF] px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-95"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="smooth-scroll mt-14 flex min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {user && (
          <div className="shrink-0 px-6 pt-5">
            <StatsBar
              refreshTrigger={statsRefresh}
              cacheUserId={user.id}
              optimisticThumbs={thumbOptimistic}
              onStatsFetched={handleStatsThumbsSynced}
            />
          </div>
        )}

        {/* Optimize area — wrapped in ClientErrorBoundary for resilient UI recovery */}
        <ClientErrorBoundary>
        {/* Two-column textarea section: row on large screens, normal flow, no overlap */}
        <div className="flex w-full flex-col gap-5 px-6 pb-0 pt-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <PromptInput
              variant="optimizer"
              value={inputText}
              onChange={setInputText}
              disabled={isLoading}
            />
            <div className="mt-2 flex justify-end">
              <TranslateButton
                text={inputText}
                onTranslated={(t) => setInputText(t)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <StreamingPromptOutput
              variant="optimizer"
              text={completion}
              isStreaming={isLoading}
              onExplanation={setExplanation}
              afterTextarea={
                completion && !isLoading ? (
                  <RunActions
                    historyId={historyId}
                    userId={user?.id ?? null}
                    sessionId={sessionId}
                    inputText={inputText}
                    optimized={optimizedTextFromFullCompletion(completion)}
                    fullText={completion}
                    explanation={explanation}
                    mode={runMeta?.mode ?? selectedMode}
                    provider={runMeta?.provider ?? provider}
                    inputLength={runMeta?.inputLength ?? inputText.trim().length}
                    outputLength={optimizedTextFromFullCompletion(completion).length}
                    inLibrary={inLibrary}
                    feedbackDisabled={Boolean(user?.id && !historyId)}
                    onSavedToLibrary={() => setInLibrary(true)}
                    onFeedbackSubmitted={handleFeedbackSubmitted}
                    onRemediate={handleRemediate}
                    onTranslateOutput={handleTranslateOutput}
                  />
                ) : null
              }
            />
          </div>
        </div>

        {/* Mode + Optimize — below textareas, centered column */}
        <div className="shrink-0 px-6 py-5">
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center">
            <span className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-[#71717A]">
              Mode
            </span>
            <div className="flex w-full justify-center">
              <AppModeSelector
                variant="optimizer"
                value={selectedMode}
                onChange={setSelectedMode}
                disabled={isLoading}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleOptimize()}
              disabled={!inputText.trim() || isLoading}
              className="mt-4 flex h-12 w-full max-w-[300px] cursor-pointer items-center justify-center rounded-[12px] border-none bg-[linear-gradient(135deg,#4552FF,#5c6aff)] text-[15px] font-semibold text-white transition-opacity duration-200 ease-out hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Optimizing…' : 'Optimize'}
            </button>
            <div className="mt-3">
              <ProjectLinker
                onDigest={(digest) => handleProjectDigest(digest)}
                disabled={isLoading}
              />
            </div>
            <DemoTokenBar
              key={guestUsageVersion}
              isAuthenticated={!!user}
            />
          </div>
        </div>

        {usageGateError && (
          <p className="shrink-0 px-6 pb-2 text-center text-sm text-red-400">
            {usageGateError}
          </p>
        )}

        {error && (
          <p className="shrink-0 px-6 pb-2 text-center text-sm text-red-400">
            {userFacingOptimizeError(error)}
          </p>
        )}

        <div className="mt-2 w-full shrink-0 px-6 pb-8">
          <ExplanationPanel
            explanation={explanation}
            original={inputText}
            optimized={optimizedTextFromFullCompletion(completion)}
          />
        </div>
        </ClientErrorBoundary>
      </main>

      {user && (
        <AppSettingsPanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          provider={provider}
          onProviderChange={setProvider}
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
          onSaveSuccess={() => setStatsRefresh((n) => n + 1)}
        />
      )}

      <DemoLimitModal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
      />

      <SignInRequiredModal
        isOpen={showSignInModal}
        onClose={() => setShowSignInModal(false)}
        feature="the Library"
      />

      {user && (
        <aside className="fixed bottom-0 right-0 top-14 z-30 hidden h-[calc(100vh-3.5rem)] w-72 md:block">
          <HistoryPanel
            userId={user.id}
            onSelect={handleHistorySelect}
            onDeleted={handleHistoryDeleted}
            onNewPrompt={resetComposerToNewPrompt}
            refreshTrigger={historyRefresh}
            selectedId={selectedHistoryItem?.id ?? null}
          />
        </aside>
      )}
    </div>
  );
}
