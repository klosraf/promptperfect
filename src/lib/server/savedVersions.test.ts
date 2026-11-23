import { describe, expect, it } from "vitest";
import {
  isMissingTableError,
  listSavedPromptVersions,
  snapshotSavedPrompt,
} from "./savedVersions";

const ROW = {
  id: "sp1",
  user_id: "u1",
  title: "T",
  original_prompt: "orig",
  optimized_prompt: "opt",
  explanation: "why",
  mode: "better",
  provider: "gemini",
};

interface FakeOpts {
  latest?: { version: number }[];
  latestError?: { message: string } | null;
  insertError?: { message: string } | null;
  listData?: unknown[];
  listError?: { message: string } | null;
  inserted?: Record<string, unknown>[];
}

function fakeDb(opts: FakeOpts) {
  const inserted = opts.inserted ?? [];
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: opts.listData ?? [], error: opts.listError ?? null }),
          }),
          order: () => ({
            limit: () =>
              Promise.resolve({ data: opts.latest ?? [], error: opts.latestError ?? null }),
          }),
        }),
      }),
      insert: (payload: Record<string, unknown>) => {
        inserted.push(payload);
        return Promise.resolve({ error: opts.insertError ?? null });
      },
    }),
  } as never;
}

describe("isMissingTableError", () => {
  it("matches the PostgREST missing-table shapes", () => {
    expect(isMissingTableError({ message: 'relation "pp_saved_prompt_versions" does not exist' })).toBe(true);
    expect(isMissingTableError({ message: "Could not find the table in the schema cache" })).toBe(true);
    expect(isMissingTableError({ message: "permission denied" })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});

describe("snapshotSavedPrompt", () => {
  it("writes version 1 for a prompt with no history", async () => {
    const inserted: Record<string, unknown>[] = [];
    const ok = await snapshotSavedPrompt(fakeDb({ latest: [], inserted }), ROW);
    expect(ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ saved_prompt_id: "sp1", version: 1, title: "T" });
  });

  it("increments from the latest version", async () => {
    const inserted: Record<string, unknown>[] = [];
    const ok = await snapshotSavedPrompt(fakeDb({ latest: [{ version: 3 }], inserted }), ROW);
    expect(ok).toBe(true);
    expect(inserted[0]?.version).toBe(4);
  });

  it("fails soft (false, no insert) when the table is missing", async () => {
    const inserted: Record<string, unknown>[] = [];
    const ok = await snapshotSavedPrompt(
      fakeDb({ latestError: { message: "relation does not exist" }, inserted }),
      ROW,
    );
    expect(ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});

describe("listSavedPromptVersions", () => {
  it("returns rows when the table exists", async () => {
    const out = await listSavedPromptVersions(
      fakeDb({ listData: [{ id: "v1", version: 2 }] }),
      "u1",
      "sp1",
    );
    expect(out.available).toBe(true);
    expect(out.versions).toHaveLength(1);
  });

  it("reports unavailable when the table is missing", async () => {
    const out = await listSavedPromptVersions(
      fakeDb({ listError: { message: "could not find in schema cache" } }),
      "u1",
      "sp1",
    );
    expect(out).toEqual({ available: false, versions: [] });
  });
});
