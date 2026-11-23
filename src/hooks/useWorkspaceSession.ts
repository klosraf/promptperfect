'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMounted } from '@/hooks/useMounted';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import type { AppUser, Provider } from '@/lib/types';
import { createSupabaseBrowserClient } from '@/lib/client/supabaseBrowser';
import {
  buildAppUserFromSupabaseUser,
  clearStoredApiKeys,
  loadApiKey,
  readEnginePrefs,
} from '@/lib/client/enginePrefsStorage';
import {
  persistEnginePrefsFromAuthUser,
  resolveAuthUserAndSession,
} from '@/lib/client/ppUserSync';
import { claimGuestHistoryAfterAuth } from '@/lib/client/claimGuestHistory';
import { wipeBrowserSupabaseSession } from '@/lib/client/supabaseBrowserSessionWipe';

export interface WorkspaceSession {
  mounted: boolean;
  hydrated: boolean;
  user: AppUser | null;
  provider: Provider;
  setProvider: (p: Provider) => void;
  apiKey: string;
  setApiKey: (k: string) => void;
  signingOut: boolean;
  handleLogout: () => Promise<void>;
}

function toProvider(value: unknown): Provider {
  return value === 'openai' || value === 'anthropic' ? value : 'gemini';
}

/**
 * Auth + engine-prefs session for the `/app` workspace. Owns mount/hydration
 * gates, the Supabase auth subscription, provider/API-key prefs, and logout.
 * Extracted from `src/app/app/page.tsx` — behavior preserved verbatim.
 */
export function useWorkspaceSession(): WorkspaceSession {
  const router = useRouter();
  const mounted = useMounted();
  const [user, setUser] = useState<AppUser | null>(null);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    const client = createSupabaseBrowserClient();
    if (!client) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- EGM E4 (signed): terminal branch synchronizing with external systems (absence of a Supabase client is an environment fact, not derived state). It sets terminal defaults once and returns; no render cascade is possible.
      setUser(null);
      setProvider('gemini');
      setApiKey('');
      setHydrated(true);
      return;
    }

    const applyAuthUser = (authUser: User | null) => {
      if (!authUser?.id) {
        setUser(null);
        const p = toProvider(readEnginePrefs()?.provider);
        setProvider(p);
        setApiKey(loadApiKey(p));
        setHydrated(true);
        return;
      }
      persistEnginePrefsFromAuthUser();
      const prefs = readEnginePrefs();
      const u = buildAppUserFromSupabaseUser(authUser, prefs) as AppUser;
      setUser(u);
      const up = toProvider(u.provider);
      setProvider(up);
      setApiKey(loadApiKey(up));
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

  // EGM E4: apiKey follows provider (it is read from localStorage per
  // provider). Adjusted during render — the React-docs pattern for
  // state that tracks a prop — instead of an effect. This must stay
  // useState, not a pure derivation: setApiKey is public API of this
  // hook and the key can also be written without a provider change
  // (settings panel save).
  const [prevProvider, setPrevProvider] = useState(provider);
  if (provider !== prevProvider) {
    setPrevProvider(provider);
    setApiKey(loadApiKey(provider));
  }

  const handleLogout = useCallback(async () => {
    setSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } finally {
      clearStoredApiKeys();
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
  }, [router]);

  return {
    mounted,
    hydrated,
    user,
    provider,
    setProvider,
    apiKey,
    setApiKey,
    signingOut,
    handleLogout,
  };
}
