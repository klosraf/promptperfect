'use strict';

const DEFAULT_API_URL = 'https://promptperfect.vercel.app';
const DEFAULT_MODE = 'better';
const DEFAULT_PROVIDER = 'gemini';
const FETCH_TIMEOUT_MS = 30_000;

function friendlyApiError(status, data) {
  const msg =
    (typeof data?.error === 'string' && data.error) ||
    (typeof data?.message === 'string' && data.message) ||
    '';

  if (status === 401) {
    return (
      'Add your API key in extension Settings (⚙). ' +
      'The extension cannot use your web login — BYOK is required.'
    );
  }
  if (status === 429) {
    return msg || 'Too many requests — wait a minute and try again.';
  }
  if (status === 400 && msg) {
    return msg;
  }
  return msg || `Request failed (${status})`;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'OPTIMIZE') return false;

  (async () => {
    const settings = await chrome.storage.sync.get({
      apiUrl: DEFAULT_API_URL,
      mode: DEFAULT_MODE,
      provider: DEFAULT_PROVIDER,
    });

    // EGM E7 (F6-09): the BYOK key lives ONLY in chrome.storage.local —
    // storage.sync replicates values to the browser vendor's cloud and to
    // every signed-in browser. Read-time migration: a legacy key still in
    // sync is moved to local and removed from sync on first read.
    const localSettings = await chrome.storage.local.get({ apiKey: '' });
    let storedKey =
      typeof localSettings.apiKey === 'string' ? localSettings.apiKey : '';
    if (!storedKey) {
      const legacy = await chrome.storage.sync.get({ apiKey: '' });
      if (typeof legacy.apiKey === 'string' && legacy.apiKey) {
        storedKey = legacy.apiKey;
        await chrome.storage.local.set({ apiKey: storedKey });
        await chrome.storage.sync.remove('apiKey');
      }
    }

    const apiUrl =
      typeof settings.apiUrl === 'string' && settings.apiUrl.trim()
        ? settings.apiUrl.trim().replace(/\/$/, '')
        : DEFAULT_API_URL;

    const mode =
      typeof message.mode === 'string' && message.mode.trim()
        ? message.mode.trim()
        : typeof settings.mode === 'string' && settings.mode.trim()
          ? settings.mode.trim()
          : DEFAULT_MODE;

    const provider =
      typeof message.provider === 'string' && message.provider.trim()
        ? message.provider.trim()
        : typeof settings.provider === 'string' && settings.provider.trim()
          ? settings.provider.trim()
          : DEFAULT_PROVIDER;

    const apiKey = storedKey.trim();

    if (!apiKey) {
      return {
        error:
          'No API key saved. Open extension Settings (⚙), paste your Gemini / OpenAI / Anthropic key, choose provider, and click Save.',
        code: 'MISSING_API_KEY',
      };
    }

    const url = `${apiUrl}/api/optimize-sync`;
    const body = {
      prompt: message.text,
      text: message.text,
      mode,
      provider,
      apiKey,
    };
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        return { error: friendlyApiError(res.status, data), code: 'API_ERROR' };
      }

      const optimizedText =
        (typeof data.optimizedText === 'string' && data.optimizedText) ||
        (typeof data.result === 'string' && data.result) ||
        '';

      if (!optimizedText.trim()) {
        return {
          error: 'Empty response from API — check API URL and provider match your key.',
          code: 'EMPTY_RESPONSE',
        };
      }

      return { optimizedText: optimizedText.trim(), ...data };
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      return {
        error: isTimeout
          ? 'Request timed out — check API URL (use http://localhost:3000 for local dev)'
          : err instanceof Error
            ? err.message
            : 'Network error — check API URL and reload the extension',
        code: 'NETWORK_ERROR',
      };
    }
  })()
    .then(sendResponse)
    .catch((e) =>
      sendResponse({
        error: e instanceof Error ? e.message : 'Optimization failed',
        code: 'WORKER_ERROR',
      }),
    );

  return true;
});
