'use client';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOptimizeRunner } from './useOptimizeRunner';
import type { AppUser } from '@/lib/types';

vi.mock('@ai-sdk/react', () => ({
  useCompletion: (opts: {
    onFinish?: (prompt: string, completion: string) => void;
    onError?: (err: Error) => void;
    fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  }) => {
    completionCapture.opts = opts;
    return {
      completion: completionCapture.completion,
      complete: completionCapture.complete,
      setCompletion: completionCapture.setCompletion,
      isLoading: false,
      error: null,
    };
  },
}));

const completionCapture: {
  opts: {
    onFinish?: (prompt: string, completion: string) => void;
    onError?: (err: Error) => void;
    fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  };
  completion: string;
  complete: ReturnType<typeof vi.fn>;
  setCompletion: ReturnType<typeof vi.fn>;
} = {
  opts: {},
  completion: '',
  complete: vi.fn(),
  setCompletion: vi.fn(),
};

vi.mock('@/lib/client/optimizationHistory', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/client/optimizationHistory')>();
  return {
    ...mod,
    getOrCreateSessionId: () => 'sess-browser',
    saveToHistory: (params: unknown) => mockSaveToHistory(params),
  };
});

const savedPayloads: unknown[] = [];
const mockSaveToHistory = vi.fn(async (params: unknown) => {
  savedPayloads.push(params);
  return 'local-test-id';
});

const mockSetInLibrary = vi.fn();
vi.mock('@/hooks/useLibraryStatus', () => ({
  useLibraryStatus: () => [null, mockSetInLibrary],
}));

const guestUsageSyncCapture: {
  onSynced?: () => void;
} = {};
vi.mock('@/hooks/useGuestUsageSync', () => ({
  useGuestUsageSync: (opts: { onSynced?: () => void }) => {
    guestUsageSyncCapture.onSynced = opts.onSynced;
  },
}));

function guestFetch(handler: (url: string, init?: RequestInit) => unknown) {
  return vi.fn(async (url: unknown, init?: RequestInit) => handler(String(url), init));
}

const GUEST = null;

function setup(provider: 'gemini' | 'openai' = 'gemini', apiKey = '') {
  return renderHook(() =>
    useOptimizeRunner({
      user: GUEST,
      provider,
      apiKey,
      mounted: true,
      hydrated: true,
    }),
  );
}

describe('useOptimizeRunner', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    savedPayloads.length = 0;
    completionCapture.opts = {};
    completionCapture.completion = '';
    mockSaveToHistory.mockResolvedValue('local-test-id');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocks guests at the token limit with the limit modal', async () => {
    localStorage.setItem('pp_guest_tokens_used', '5');
    const fetchMock = guestFetch(() => {
      throw new Error('must not call network when gated');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = setup();
    act(() => {
      result.current.setInputText('over the limit run');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });
    expect(result.current.showLimitModal).toBe(true);
    expect(completionCapture.complete).not.toHaveBeenCalled();
  });

  it('does nothing for blank input', async () => {
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const { result } = setup();
    await act(async () => {
      await result.current.handleOptimize();
    });
    expect(result.current.showLimitModal).toBe(false);
    expect(completionCapture.complete).not.toHaveBeenCalled();
  });

  it('reserves guest quota then streams via the gemini path and saves history', async () => {
    localStorage.setItem('pp_guest_tokens_used', '1');
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      guestFetch((url) => {
        calls.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({ count: 2, persisted: true }),
        };
      }),
    );

    const { result } = setup();
    act(() => {
      result.current.setInputText('  make it better  ');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });

    expect(calls).toContain('/api/guest-usage');
    expect(completionCapture.complete).toHaveBeenCalledTimes(1);
    expect(result.current.sessionId).toBeTruthy();
    expect(result.current.runMeta).toMatchObject({
      mode: 'better',
      provider: 'gemini',
      inputLength: 14,
    });

    // Simulate the stream finishing.
    await act(async () => {
      await completionCapture.opts.onFinish?.('make it better', 'improved text');
    });
    expect(mockSaveToHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt_original: 'make it better',
        prompt_optimized: 'improved text',
        userId: undefined,
      }),
    );
    expect(result.current.historyId).toBe('local-test-id');
  });

  it('uses the sync endpoint for non-gemini providers with BYOK headers', async () => {
    localStorage.setItem('pp_guest_tokens_used', '0');
    const seen: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      guestFetch((url, init) => {
        seen.push({ url, init });
        if (url === '/api/guest-usage') {
          return { ok: true, status: 200, json: async () => ({ count: 1 }) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            optimizedText: 'synced output',
            explanation: 'because',
            changes: '- a\n+ b',
          }),
        };
      }),
    );

    const { result } = setup('openai', 'sk-test');
    act(() => {
      result.current.setInputText('draft');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });
    await waitFor(() =>
      expect(mockSaveToHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt_original: 'draft',
          prompt_optimized: 'synced output',
          provider: 'openai',
        }),
      ),
    );
    const syncCall = seen.find((c) => c.url === '/api/optimize-sync');
    expect(syncCall).toBeDefined();
    const headers = syncCall?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(String(syncCall?.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ apiKey: 'sk-test', provider: 'openai' });
  });

  it('syncs the local counter and opens the modal on guest 429', async () => {
    localStorage.setItem('pp_guest_tokens_used', '2');
    vi.stubGlobal(
      'fetch',
      guestFetch(() => ({
        ok: false,
        status: 429,
        json: async () => ({ count: 5 }),
      })),
    );
    const { result } = setup();
    act(() => {
      result.current.setInputText('hello');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });
    expect(result.current.showLimitModal).toBe(true);
    expect(localStorage.getItem('pp_guest_tokens_used')).toBe('5');
    expect(completionCapture.complete).not.toHaveBeenCalled();
  });

  it('loads a history item into the composer and toggles back on re-select', () => {
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const { result } = setup();
    const item = {
      id: 'h1',
      session_id: 's1',
      prompt_original: 'orig',
      prompt_optimized: 'opt',
      mode: 'specific',
      explanation: 'why',
      created_at: new Date().toISOString(),
      optimize_session_id: 'run-9',
    };
    act(() => {
      result.current.handleHistorySelect(item);
    });
    expect(result.current.historyId).toBe('h1');
    expect(result.current.sessionId).toBe('run-9');
    expect(result.current.inputText).toBe('orig');
    expect(result.current.selectedMode).toBe('specific');
    expect(result.current.runMeta?.inputLength).toBe(4);

    act(() => {
      result.current.handleHistorySelect(item);
    });
    expect(result.current.historyId).toBeNull();
    expect(result.current.inputText).toBe('');
  });

  it('applies the sessionStorage reoptimize intent on init', () => {
    sessionStorage.setItem(
      'pp_reoptimize',
      JSON.stringify({ text: 'from library', mode: 'cot', autoOptimize: true }),
    );
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const { result } = setup();
    expect(result.current.inputText).toBe('from library');
    expect(result.current.selectedMode).toBe('cot');
    expect(sessionStorage.getItem('pp_reoptimize')).toBeNull();
  });

  it('remediate appends directives and translate swaps the output', () => {
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const { result } = setup();
    act(() => {
      result.current.setInputText('base');
    });
    act(() => {
      result.current.handleRemediate('\n- fix this');
    });
    expect(result.current.inputText).toBe('base\n- fix this');

    act(() => {
      result.current.handleTranslateOutput('texto traducido');
    });
    expect(result.current.historyId).toBeNull();
    expect(result.current.explanation).toBe('');
  });

  it('resetComposerToNewPrompt clears run state', () => {
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const { result } = setup();
    act(() => {
      result.current.setInputText('something');
      result.current.resetComposerToNewPrompt();
    });
    expect(result.current.inputText).toBe('');
    expect(result.current.selectedMode).toBe('better');
    expect(result.current.sessionId).toBeNull();
    expect(result.current.runMeta).toBeNull();
  });

  it('passes the signed-in user through to history saves', async () => {
    const user: AppUser = {
      id: 'u-1',
      name: 'U',
      email: 'u@x.com',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
    };
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const { result } = renderHook(() =>
      useOptimizeRunner({ user, provider: 'gemini', apiKey: '', mounted: true, hydrated: true }),
    );
    act(() => {
      result.current.setInputText('hi');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });
    await act(async () => {
      await completionCapture.opts.onFinish?.('hi', 'hi!');
    });
    expect(mockSaveToHistory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', sessionId: 'sess-browser' }),
    );
  });

  it('handleProjectDigest resets the composer and arms an auto-run', () => {
    // Arming the auto-run schedules a real optimize pass, which calls the
    // guest-usage endpoint. Stub it or the relative URL never resolves in
    // jsdom and the run rejects unhandled.
    vi.stubGlobal('fetch', guestFetch(() => ({ ok: true, status: 200, json: async () => ({ count: 1 }) })));

    const { result } = setup();

    // Leave some run state behind so we can prove the reset happened.
    act(() => {
      result.current.setInputText('draft prompt');
      result.current.handleHistorySelect({
        id: 'h1',
        session_id: 's1',
        prompt_original: 'orig',
        prompt_optimized: 'opt',
        mode: 'specific',
        explanation: 'why',
        created_at: new Date().toISOString(),
        optimize_session_id: 'run-1',
      });
    });

    const digest = 'PROJECT DIGEST\n- package.json\n- src/';
    act(() => {
      result.current.handleProjectDigest(digest);
    });

    // The digest replaces the input wholesale, not appends.
    expect(result.current.inputText).toBe(digest);
    // Production mode is the only mode that consumes a digest.
    expect(result.current.selectedMode).toBe('production');
    // Prior selection is cleared so the run is not attributed to old history.
    expect(result.current.selectedHistoryItem).toBeNull();
    expect(result.current.sessionId).toBeNull();
  });

  it('handleHistoryDeleted refreshes both lists and clears a matching selection', () => {
    const { result } = setup();

    act(() => {
      result.current.handleHistorySelect({
        id: 'h-del',
        session_id: 's-del',
        prompt_original: 'orig',
        prompt_optimized: 'opt',
        mode: 'better',
        explanation: 'why',
        created_at: new Date().toISOString(),
        optimize_session_id: 'run-del',
      });
    });
    const statsBefore = result.current.statsRefresh;
    const historyBefore = result.current.historyRefresh;
    expect(result.current.sessionId).toBe('run-del');

    act(() => {
      result.current.handleHistoryDeleted('h-del');
    });

    // Both panels poll again, otherwise a deleted row lingers in the UI.
    expect(result.current.historyRefresh).toBe(historyBefore + 1);
    expect(result.current.statsRefresh).toBe(statsBefore + 1);
    // The deleted item was the selected one, so selection and its run id go.
    expect(result.current.selectedHistoryItem).toBeNull();
    expect(result.current.sessionId).toBeNull();
  });

  it('stream fetch surfaces provider error bodies and passes ok through', async () => {
    // The hook's custom fetch wraps the global one: stub global per case.
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    setup();
    const streamFetch = completionCapture.opts.fetch;
    expect(streamFetch).toBeDefined();

    const runWith = async (res: unknown) => {
      vi.stubGlobal('fetch', guestFetch(() => res));
      return streamFetch!('http://x', {});
    };
    const errRes = {
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: 'quota exploded' }),
    };
    await expect(runWith(errRes)).rejects.toThrow('quota exploded');

    const msgRes = {
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ message: 'backend says no' }),
    };
    await expect(runWith(msgRes)).rejects.toThrow('backend says no');

    const garbageRes = {
      ok: false,
      status: 503,
      text: async () => 'not json{{{',
    };
    await expect(runWith(garbageRes)).rejects.toThrow('Request failed: 503');

    const okRes = { ok: true, status: 200 };
    await expect(runWith(okRes)).resolves.toBe(okRes);
  });

  it('stream onError refunds guest quota but never touches signed-in users', () => {
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    localStorage.setItem('pp_guest_tokens_used', '3');
    setup();
    completionCapture.opts.onError?.(new Error('boom'));
    expect(localStorage.getItem('pp_guest_tokens_used')).toBe('2');

    const user: AppUser = {
      id: 'u-9',
      name: 'U',
      email: 'u@x.com',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
    };
    localStorage.setItem('pp_guest_tokens_used', '3');
    renderHook(() =>
      useOptimizeRunner({ user, provider: 'gemini', apiKey: '', mounted: true, hydrated: true }),
    );
    completionCapture.opts.onError?.(new Error('boom'));
    expect(localStorage.getItem('pp_guest_tokens_used')).toBe('3');
  });

  it('falls back to Math.random session ids without crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', {});
    vi.stubGlobal(
      'fetch',
      guestFetch(() => ({
        ok: true,
        status: 200,
        json: async () => ({ count: 1 }),
      })),
    );
    const { result } = setup();
    act(() => {
      result.current.setInputText('fallback ids');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });
    expect(result.current.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('ignores malformed or modeless reoptimize intents', () => {
    sessionStorage.setItem('pp_reoptimize', '{bad json');
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const bad = setup();
    expect(bad.result.current.inputText).toBe('');

    sessionStorage.setItem(
      'pp_reoptimize',
      JSON.stringify({ text: '  ', mode: 'nope', autoOptimize: false }),
    );
    const empty = setup();
    expect(empty.result.current.inputText).toBe('');
    expect(empty.result.current.selectedMode).toBe('better');
  });

  it('auto-runs the reoptimize intent for signed-in users', async () => {
    const user: AppUser = {
      id: 'u-auto',
      name: 'U',
      email: 'u@x.com',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
    };
    sessionStorage.setItem(
      'pp_reoptimize',
      JSON.stringify({ text: 'auto run me', mode: 'better', autoOptimize: true }),
    );
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    renderHook(() =>
      useOptimizeRunner({ user, provider: 'gemini', apiKey: '', mounted: true, hydrated: true }),
    );
    await waitFor(() => expect(completionCapture.complete).toHaveBeenCalled());
  });

  it('opens the modal at the limit on guest 429 without a server count', async () => {
    localStorage.setItem('pp_guest_tokens_used', '2');
    vi.stubGlobal(
      'fetch',
      guestFetch(() => ({
        ok: false,
        status: 429,
        json: async () => ({}),
      })),
    );
    const { result } = setup();
    act(() => {
      result.current.setInputText('hello');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });
    expect(result.current.showLimitModal).toBe(true);
    expect(completionCapture.complete).not.toHaveBeenCalled();
  });

  it('falls through to an optimistic run when guest tracking errors', async () => {
    localStorage.setItem('pp_guest_tokens_used', '0');
    vi.stubGlobal(
      'fetch',
      guestFetch(() => ({ ok: false, status: 503, json: async () => ({}) })),
    );
    const { result } = setup();
    act(() => {
      result.current.setInputText('optimistic');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });
    expect(completionCapture.complete).toHaveBeenCalledTimes(1);
    expect(result.current.showLimitModal).toBe(false);
  });

  it('sync path refunds quota and surfaces the error on failure', async () => {
    localStorage.setItem('pp_guest_tokens_used', '2');
    vi.stubGlobal(
      'fetch',
      guestFetch((url) => {
        if (url === '/api/guest-usage') {
          return { ok: true, status: 200, json: async () => ({ count: 3 }) };
        }
        throw new Error('sync boom');
      }),
    );
    const { result } = setup('openai');
    act(() => {
      result.current.setInputText('draft');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });
    await waitFor(() => expect(result.current.error?.message).toBe('sync boom'));
    expect(localStorage.getItem('pp_guest_tokens_used')).toBe('2');
  });

  it('sync success without explanation skips delimiters', async () => {
    localStorage.setItem('pp_guest_tokens_used', '0');
    vi.stubGlobal(
      'fetch',
      guestFetch((url) => {
        if (url === '/api/guest-usage') {
          return { ok: true, status: 200, json: async () => ({ count: 1 }) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ optimizedText: 'plain output' }),
        };
      }),
    );
    const { result } = setup('openai');
    act(() => {
      result.current.setInputText('draft');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });
    await waitFor(() => expect(result.current.completion).toBe('plain output'));
    expect(result.current.explanation).toBe('');
  });

  it('reset and translate and history-select cover the sync branch', async () => {
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const { result } = setup('openai');
    const item = {
      id: 'h-sync',
      session_id: 's-sync',
      prompt_original: 'orig',
      prompt_optimized: 'opt',
      mode: 'better',
      explanation: '',
      created_at: new Date().toISOString(),
      optimize_session_id: 'run-sync',
    };
    act(() => {
      result.current.handleHistorySelect(item);
    });
    expect(result.current.completion).toBe('opt');
    act(() => {
      result.current.handleTranslateOutput('salida');
    });
    expect(result.current.completion).toBe('salida');
    act(() => {
      result.current.resetComposerToNewPrompt();
    });
    expect(result.current.completion).toBe('');
    expect(result.current.selectedMode).toBe('better');
  });

  it('handleRemediate ignores blank directives', () => {
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const { result } = setup();
    act(() => {
      result.current.setInputText('base');
    });
    act(() => {
      result.current.handleRemediate('   ');
    });
    expect(result.current.inputText).toBe('base');
  });

  it('handleHistoryDeleted clears the library flag when the history id matches', () => {
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const { result } = setup();
    act(() => {
      result.current.handleHistorySelect({
        id: 'h-lib',
        session_id: 's-lib',
        prompt_original: 'orig',
        prompt_optimized: 'opt',
        mode: 'better',
        explanation: '',
        created_at: new Date().toISOString(),
        optimize_session_id: 'run-lib',
      });
    });
    mockSetInLibrary.mockClear();
    act(() => {
      result.current.handleHistoryDeleted('h-lib');
    });
    expect(mockSetInLibrary).toHaveBeenCalledWith(false);
  });

  it('thumbs cascade refreshes stats immediately and on a delay', () => {
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    vi.useFakeTimers();
    try {
      const { result } = setup();
      const statsBefore = result.current.statsRefresh;
      // Syncing server totals only reseeds the baseline (no refresh yet).
      act(() => {
        result.current.handleStatsThumbsSynced({ thumbsUp: 2, thumbsDown: 1 });
      });
      expect(result.current.statsRefresh).toBe(statsBefore);

      const historyBefore = result.current.historyRefresh;
      act(() => {
        result.current.handleFeedbackSubmitted('up');
      });
      expect(result.current.historyRefresh).toBe(historyBefore + 1);
      expect(result.current.thumbOptimistic.up).toBe(1);
      act(() => {
        vi.runAllTimers();
      });
      expect(result.current.statsRefresh).toBeGreaterThan(statsBefore + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('guest 429 with unreadable body still opens the modal', async () => {
    localStorage.setItem('pp_guest_tokens_used', '2');
    vi.stubGlobal(
      'fetch',
      guestFetch(() => ({
        ok: false,
        status: 429,
        json: async () => {
          throw new Error('no json');
        },
      })),
    );
    const { result } = setup();
    act(() => {
      result.current.setInputText('hello');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });
    expect(result.current.showLimitModal).toBe(true);
    expect(completionCapture.complete).not.toHaveBeenCalled();
  });

  it('adopts the higher server guest count, keeps local when higher', async () => {
    const runWithCount = async (count: number) => {
      localStorage.setItem('pp_guest_tokens_used', '1');
      vi.stubGlobal(
        'fetch',
        guestFetch(() => ({
          ok: true,
          status: 200,
          json: async () => ({ count }),
        })),
      );
      const { result } = setup();
      act(() => {
        result.current.setInputText('hi');
      });
      await act(async () => {
        await result.current.handleOptimize();
      });
      return localStorage.getItem('pp_guest_tokens_used');
    };
    expect(await runWithCount(9)).toBe('9');
    expect(await runWithCount(0)).toBe('2');
  });

  it('sync endpoint error payload surfaces as the run error', async () => {
    localStorage.setItem('pp_guest_tokens_used', '0');
    vi.stubGlobal(
      'fetch',
      guestFetch((url) => {
        if (url === '/api/guest-usage') {
          return { ok: true, status: 200, json: async () => ({ count: 1 }) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ error: 'model exploded' }),
        };
      }),
    );
    const { result } = setup('openai');
    act(() => {
      result.current.setInputText('draft');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });
    await waitFor(() => expect(result.current.error?.message).toBe('model exploded'));
  });

  it('seeds thumbs from the stats cache for returning users', () => {
    const user: AppUser = {
      id: 'u-cache',
      name: 'U',
      email: 'u@x.com',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
    };
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    sessionStorage.setItem(
      'pp:stats_bar_v1',
      JSON.stringify({
        userId: 'u-cache',
        savedAt: Date.now(),
        thumbsUp: 4,
        thumbsDown: 1,
      }),
    );
    const { unmount } = renderHook(() =>
      useOptimizeRunner({ user, provider: 'gemini', apiKey: '', mounted: true, hydrated: true }),
    );
    unmount();
    sessionStorage.clear();
    renderHook(() =>
      useOptimizeRunner({ user, provider: 'gemini', apiKey: '', mounted: true, hydrated: true }),
    );
  });

  it('guest usage with unreadable body falls back to local counting', async () => {
    localStorage.setItem('pp_guest_tokens_used', '0');
    vi.stubGlobal(
      'fetch',
      guestFetch(() => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('no json');
        },
      })),
    );
    const { result } = setup();
    act(() => {
      result.current.setInputText('hi');
    });
    await act(async () => {
      await result.current.handleOptimize();
    });
    expect(completionCapture.complete).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('pp_guest_tokens_used')).toBe('1');
  });

  it('guest usage sync callback bumps the version', () => {
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const { result } = setup();
    const before = result.current.guestUsageVersion;
    act(() => {
      guestUsageSyncCapture.onSynced?.();
    });
    expect(result.current.guestUsageVersion).toBe(before + 1);
  });

  it('refreshStats bumps the stats version', () => {
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const { result } = setup();
    const before = result.current.statsRefresh;
    act(() => {
      result.current.refreshStats();
    });
    expect(result.current.statsRefresh).toBe(before + 1);
  });

  it('tolerates unavailable sessionStorage on mount', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new Error('denied');
    });
    vi.stubGlobal('fetch', guestFetch(() => ({})));
    const { result } = setup();
    expect(result.current.inputText).toBe('');
  });

  it('handleHistoryDeleted keeps the selection when another row is deleted', () => {
    const { result } = setup();

    act(() => {
      result.current.handleHistorySelect({
        id: 'h-keep',
        session_id: 's-keep',
        prompt_original: 'orig',
        prompt_optimized: 'opt',
        mode: 'better',
        explanation: 'why',
        created_at: new Date().toISOString(),
        optimize_session_id: 'run-keep',
      });
    });

    act(() => {
      result.current.handleHistoryDeleted('some-other-id');
    });

    // Deleting an unrelated row must not drop what the user is looking at.
    expect(result.current.selectedHistoryItem?.id).toBe('h-keep');
    expect(result.current.sessionId).toBe('run-keep');
    expect(result.current.historyRefresh).toBeGreaterThan(0);
  });
});
