'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { PROMPT_TEMPLATES } from '@/lib/promptTemplates';
import { useSavedLibrary } from '@/hooks/useSavedLibrary';
import { LibraryEmptyState, LibrarySkeleton, DeleteConfirmModal } from '@/components/library/LibraryStates';
import { SavedPromptsTab } from '@/components/library/SavedPromptsTab';
import type { SavedPromptRow, SavedPromptVersionRow } from '@/lib/library';
import { TemplatesTab } from '@/components/library/TemplatesTab';

export default function LibraryPage() {
  const lib = useSavedLibrary();
  /** ID pending confirmation before delete; null = no modal open */
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ── Version history (fail-soft: hidden until the table exists) ──────
  const [versionsById, setVersionsById] = useState<
    Record<string, SavedPromptVersionRow[] | 'unavailable'>
  >({});

  const loadVersions = async (row: SavedPromptRow) => {
    try {
      const res = await fetch(
        `/api/saved-prompts/versions?savedId=${encodeURIComponent(row.id)}`,
      );
      if (!res.ok) throw new Error('load failed');
      const json = (await res.json()) as {
        available: boolean;
        versions: SavedPromptVersionRow[];
      };
      setVersionsById((prev) => ({
        ...prev,
        [row.id]: json.available ? json.versions : 'unavailable',
      }));
    } catch {
      setVersionsById((prev) => ({ ...prev, [row.id]: 'unavailable' }));
    }
  };

  const handleToggleExpand = (id: string | null) => {
    setExpandedId(id);
    if (id) {
      const row = rows.find((r) => r.id === id);
      if (row && versionsById[id] === undefined) void loadVersions(row);
    }
  };

  const handleSaveEdit = async (
    row: SavedPromptRow,
    patch: { title: string; optimized_prompt: string },
  ) => {
    const res = await fetch('/api/saved-prompts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: row.id,
        title: patch.title,
        optimized_prompt: patch.optimized_prompt,
      }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as { prompt: SavedPromptRow };
    updateRow({ ...row, ...json.prompt });
    void loadVersions(row);
  };

  const handleRestoreVersion = async (
    row: SavedPromptRow,
    version: SavedPromptVersionRow,
  ) => {
    const res = await fetch('/api/saved-prompts/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedId: row.id, versionId: version.id }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as { prompt: SavedPromptRow };
    updateRow({ ...row, ...json.prompt });
    void loadVersions(row);
  };

  const {
    mounted,
    authReady,
    user,
    rows,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    modeFilter,
    setModeFilter,
    expandedId,
    setExpandedId,
    visibleRows,
    filteredCount,
    hasMore,
    loadMore,
    confirmDelete,
    updateRow,
    reoptimize,
    tab,
    setTab,
    tplCategory,
    setTplCategory,
    tplExpandedId,
    setTplExpandedId,
    filteredTemplates,
    templateCountByCategory,
    tplSavingId,
    tplError,
    isTplSaved,
    useTemplate,
    saveTemplate,
  } = lib;

  // ── Auth / mount gate ──────────────────────────────────────────────────────
  if (!mounted || !authReady) {
    return (
      <div className="min-h-screen bg-background px-6 py-8 font-sans">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 h-8 w-32 animate-pulse rounded bg-muted" />
          <LibrarySkeleton />
        </div>
      </div>
    );
  }

  // ── Unauthenticated ────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-background px-6 py-12 font-sans text-foreground">
        <div className="mx-auto max-w-md text-center">
          <div className="mb-6">
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to optimizer
            </Link>
          </div>
          <Bookmark className="mx-auto mb-4 h-16 w-16 text-accent" strokeWidth={1} aria-hidden />
          <h2 className="mb-2 font-[family-name:var(--font-space-grotesk),sans-serif] text-2xl font-bold text-foreground">
            Your Prompt Library
          </h2>
          <p className="mb-8 text-sm text-muted-foreground">
            Save and revisit your best optimized prompts. Create a free account to get started.
          </p>
          <LibraryEmptyState
            message="Sign in to view your saved prompts"
            description="Create a free account to save and revisit your best optimized prompts across any device."
          >
            <Link
              href="/signup"
              className="inline-flex h-11 items-center justify-center rounded-[12px] cta-gradient px-8 text-[15px] font-semibold text-white transition-opacity hover:opacity-95"
            >
              Sign up free
            </Link>
            <Link
              href="/login"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Already have an account? Log in
            </Link>
          </LibraryEmptyState>
        </div>
      </div>
    );
  }

  // ── Authenticated ──────────────────────────────────────────────────────────
  return (
    <>
      {/* Delete confirm modal */}
      {deleteConfirmId && (
        <DeleteConfirmModal
          onConfirm={() => void confirmDelete(deleteConfirmId).finally(() => setDeleteConfirmId(null))}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      <div className="min-h-screen bg-background px-6 py-8 font-sans text-foreground">
        <header className="mx-auto mb-8 flex max-w-4xl flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex flex-col gap-1">
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to optimizer
            </Link>
            <h1 className="font-[family-name:var(--font-space-grotesk),sans-serif] text-2xl font-bold text-foreground">
              Prompt Library
            </h1>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <span className="text-[13px] text-muted-foreground">{user.name || user.email}</span>
            <span className="text-[12px] text-muted-foreground">{rows.length} saved</span>
          </div>
        </header>

        <main className="mx-auto max-w-4xl">
          {/* Tabs */}
          <div
            className="mb-4 flex gap-2"
            role="tablist"
            aria-label="Library sections"
          >
            {(
              [
                { id: 'mine' as const, label: `My Library (${rows.length})` },
                { id: 'templates' as const, label: `Templates (${PROMPT_TEMPLATES.length})` },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-lg border px-4 py-2 text-[13px] font-medium transition-colors ${
                  tab === id
                    ? 'border-accent bg-accent/20 text-foreground'
                    : 'border-border bg-card text-foreground-dim hover:border-accent/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'mine' ? (
            <SavedPromptsTab
              totalCount={rows.length}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              modeFilter={modeFilter}
              onModeFilterChange={setModeFilter}
              loading={loading}
              error={error}
              visibleRows={visibleRows}
              filteredCount={filteredCount}
              hasMore={hasMore}
              remainingCount={filteredCount - visibleRows.length}
              onLoadMore={loadMore}
              expandedId={expandedId}
              onToggleExpand={handleToggleExpand}
              onReoptimize={reoptimize}
              versionsById={versionsById}
              onSaveEdit={handleSaveEdit}
              onRestoreVersion={handleRestoreVersion}
              onRequestDelete={setDeleteConfirmId}
              skeleton={<LibrarySkeleton />}
              emptyState={
                <LibraryEmptyState
                  message="No saved prompts yet"
                  description="Optimize a prompt to get started, then hit the bookmark icon to save it here for quick access."
                >
                  <Link
                    href="/app"
                    className="inline-flex items-center gap-2 rounded-xl cta-gradient px-5 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
                  >
                    Optimize a prompt to get started
                  </Link>
                </LibraryEmptyState>
              }
            />
          ) : (
            <TemplatesTab
              filteredTemplates={filteredTemplates}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              tplCategory={tplCategory}
              onCategoryChange={setTplCategory}
              templateCountByCategory={templateCountByCategory}
              tplError={tplError}
              tplExpandedId={tplExpandedId}
              onToggleExpand={setTplExpandedId}
              isTplSaved={isTplSaved}
              tplSavingId={tplSavingId}
              onUseTemplate={useTemplate}
              onSaveTemplate={saveTemplate}
            />
          )}
        </main>
      </div>
    </>
  );
}
