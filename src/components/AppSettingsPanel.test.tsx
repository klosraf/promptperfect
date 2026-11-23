'use client';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppSettingsPanel } from './AppSettingsPanel';
import type { Provider } from '@/lib/types';

function panelProps(overrides: Partial<React.ComponentProps<typeof AppSettingsPanel>> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    provider: 'gemini' as Provider,
    onProviderChange: vi.fn(),
    apiKey: '',
    onApiKeyChange: vi.fn(),
    onSaveSuccess: vi.fn(),
    ...overrides,
  };
}

describe('AppSettingsPanel prop synchronization (EGM E4)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps typed key text across re-renders with unchanged props', () => {
    const props = panelProps();
    const { rerender } = render(<AppSettingsPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /OpenAI/ }));
    const input = screen.getByPlaceholderText('Paste your API key');
    fireEvent.change(input, { target: { value: 'sk-typed-123' } });
    expect(input).toHaveValue('sk-typed-123');
    rerender(<AppSettingsPanel {...props} />);
    expect(screen.getByPlaceholderText('Paste your API key')).toHaveValue(
      'sk-typed-123',
    );
  });

  it('resets local provider and key when the parent provider changes', () => {
    const props = panelProps();
    const { rerender } = render(<AppSettingsPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /OpenAI/ }));
    const input = screen.getByPlaceholderText('Paste your API key');
    fireEvent.change(input, { target: { value: 'sk-typed-123' } });

    rerender(<AppSettingsPanel {...props} provider="anthropic" />);
    // Local provider follows the parent: Anthropic button is active
    // (accent styling) and the key field resets to the stored value
    // for anthropic (empty storage -> empty).
    expect(screen.getByPlaceholderText('Paste your API key')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: /Anthropic/ }).className,
    ).toContain('border-accent');
  });
});

describe('AppSettingsPanel BYOK boundary (ADR-0010)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('saves provider/model without sending api_key, and keeps the key local', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const props = panelProps();
    render(<AppSettingsPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /OpenAI/ }));
    fireEvent.change(screen.getByPlaceholderText('Paste your API key'), {
      target: { value: 'sk-local-only' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('api_key');
    expect(JSON.stringify(body)).not.toContain('sk-local-only');
    await waitFor(() =>
      expect(localStorage.getItem('promptperfect:apikey')).toContain('sk-local-only'),
    );
    expect(props.onApiKeyChange).toHaveBeenCalledWith('sk-local-only');
  });
});
