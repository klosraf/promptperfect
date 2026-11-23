/**
 * Structured change list for the optimizer's ---CHANGES--- region.
 *
 * The output contract (src/lib/prompts.ts) asks the model to tag each change
 * line with one edit method — [ADD], [REPLACE], [DELETE], [EXAMPLE],
 * [STRUCTURE] — a single-edit vocabulary borrowed from programmatic prompt
 * optimization: one method per change keeps the list auditable. Parsing is
 * tolerant: untagged lines (older runs, non-compliant models) come back as
 * OTHER and render exactly as they did before this contract existed.
 */

export type EditMethod =
  | "ADD"
  | "REPLACE"
  | "DELETE"
  | "EXAMPLE"
  | "STRUCTURE"
  | "OTHER";

export interface StructuredChange {
  method: EditMethod;
  text: string;
}

const METHODS: EditMethod[] = ["ADD", "REPLACE", "DELETE", "EXAMPLE", "STRUCTURE"];
const TAG_RE = /^\[(ADD|REPLACE|DELETE|EXAMPLE|STRUCTURE)\]\s*/i;
const BULLET_RE = /^[-*•]\s+/;

export function parseStructuredChanges(changes: string): StructuredChange[] {
  if (!changes || !changes.trim()) return [];
  const out: StructuredChange[] = [];
  for (const rawLine of changes.split("\n")) {
    const line = rawLine.trim().replace(BULLET_RE, "").trim();
    if (!line) continue;
    const tag = TAG_RE.exec(line);
    if (tag) {
      const method = METHODS.find((m) => m === tag[1]?.toUpperCase());
      out.push({ method: method ?? "OTHER", text: line.replace(TAG_RE, "").trim() });
    } else {
      out.push({ method: "OTHER", text: line });
    }
  }
  return out;
}

/** Human label for a method chip. */
export const EDIT_METHOD_LABEL: Record<EditMethod, string> = {
  ADD: "Added",
  REPLACE: "Replaced",
  DELETE: "Removed",
  EXAMPLE: "Example",
  STRUCTURE: "Structure",
  OTHER: "Change",
};
