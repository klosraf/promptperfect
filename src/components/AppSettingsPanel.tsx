'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { Provider } from '@/lib/types';
import {
  writeEnginePrefs,
  loadApiKey,
  API_KEY_STORAGE_KEY,
} from '@/lib/client/enginePrefsStorage';
import { DEFAULT_MODEL_IDS, PROVIDER_LABELS } from '@/lib/modelCatalog';

// EGM E3: labels, default model ids and the BYOK storage key were
// duplicated here (with stale values: "Gemini 2.0 Flash",
// "GPT-4o-mini", a pinned Anthropic snapshot). They now come from the
// single catalog and the shared engine-prefs storage module.
const STORAGE_KEY = API_KEY_STORAGE_KEY;
const loadStoredKey = loadApiKey;

interface AppSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onSaveSuccess: () => void;
}

export function AppSettingsPanel({
  open,
  onClose,
  provider,
  onProviderChange,
  apiKey,
  onApiKeyChange,
  onSaveSuccess,
}: AppSettingsPanelProps) {
  const [localProvider, setLocalProvider] = useState<Provider>(provider);
  const [localKey, setLocalKey] = useState(() => apiKey || loadStoredKey(provider));
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyState, setVerifyState] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [saveError, setSaveError] = useState('');

  // EGM E4: the panel mirrors the parent's provider/key whenever the
  // dialog opens or the parent changes them — state that tracks props,
  // adjusted during render per the React docs (no effect). The key is
  // primitive (open | provider | apiKey) so the reset terminates, and
  // typing in the input never touches it: localKey/localProvider are
  // the working state while the panel is open.
  const syncKey = `${open ? '1' : '0'}|${provider}|${apiKey}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    if (open) {
      setLocalProvider(provider);
      setLocalKey(apiKey || loadStoredKey(provider));
      setVerifyState('idle');
      setSaveError('');
    }
  }

  const handleVerifyKey = async () => {
    if (localProvider === 'gemini' || !localKey.trim()) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          provider: localProvider,
          apiKey: localKey.trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean }
        | null;
      setVerifyState(res.ok && data?.ok ? 'valid' : 'invalid');
    } catch {
      setVerifyState('invalid');
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/auth/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          provider: localProvider,
          model: DEFAULT_MODEL_IDS[localProvider],
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(
          typeof payload.error === 'string' && payload.error.trim()
            ? payload.error
            : 'Could not save settings',
        );
        return;
      }
      onProviderChange(localProvider);
      onApiKeyChange(localProvider !== 'gemini' ? localKey : '');
      if (localProvider !== 'gemini') {
        try {
          const stored: Record<string, string> = JSON.parse(
            localStorage.getItem(STORAGE_KEY) || '{}',
          );
          stored[localProvider] = localKey.trim();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        } catch {
          // swallow: JSON.parse failed on existing key blob — overwrite with single-provider object
          try {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ [localProvider]: localKey.trim() }),
            );
          } catch {
            // swallow: quota / private mode — key stays in memory for the session
          }
        }
      }
      writeEnginePrefs({
        provider: localProvider,
        model:
          localProvider === 'gemini'
            ? 'gemini-2.0-flash'
            : localProvider === 'openai'
              ? 'gpt-6-astra'
              : 'claude-3-5-haiku-20241022',
      });
      onSaveSuccess();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed right-0 top-0 z-50 h-full w-[360px] border-l border-border bg-popover shadow-xl transition-transform duration-300 ease-out"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold text-foreground">AI Engine Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 text-foreground-dim hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-foreground-dim">
            Current: {PROVIDER_LABELS[provider]}
          </p>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground-dim">Provider</span>
            <div className="grid grid-cols-3 gap-2">
              {(['gemini', 'openai', 'anthropic'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setLocalProvider(p);
                    setLocalKey(loadStoredKey(p));
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    localProvider === p
                      ? 'border-accent bg-accent/10 text-foreground'
                      : 'border-input text-foreground-dim hover:border-zinc-500'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                      p === 'gemini'
                        ? 'bg-emerald-400'
                        : p === 'openai'
                          ? 'bg-zinc-200'
                          : 'bg-purple-400'
                    }`}
                  />
                  {PROVIDER_LABELS[p].split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
          {localProvider !== 'gemini' && (
            <div>
              <label className="block text-sm font-medium text-foreground-dim mb-1">
                API Key
              </label>
              <input
                type="password"
                value={localKey}
                onChange={(e) => {
                  setLocalKey(e.target.value);
                  setVerifyState('idle');
                }}
                placeholder="Paste your API key"
                className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground placeholder-zinc-500 focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={handleVerifyKey}
                disabled={!localKey.trim() || verifying}
                className="mt-2 rounded-lg border border-input px-3 py-1.5 text-xs text-foreground-dim hover:bg-muted disabled:opacity-50"
              >
                {verifying ? 'Verifying…' : 'Verify'}
              </button>
              {verifyState === 'valid' && (
                <p className="mt-1 text-xs text-green-500">Key verified successfully.</p>
              )}
              {verifyState === 'invalid' && !verifying && (
                <p className="mt-1 text-xs text-red-400">Could not verify this key. Check it and try again.</p>
              )}
            </div>
          )}
          {saveError && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {saveError}
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}
