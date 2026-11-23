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
  /**
   * Verbatim spans quoted by the contract («...»): for REPLACE, `before`
   * is the original span and `after` the span in the improved prompt; for
   * ADD, `after` is the inserted span. Absent when the model did not quote
   * (older runs, non-compliant output) — such changes are display-only.
   */
  before?: string;
  after?: string;
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
      const method = METHODS.find((m) => m === tag[1]?.toUpperCase()) ?? "OTHER";
      const rest = line.replace(TAG_RE, "").trim();
      out.push({ method, text: rest, ...parseSpans(method, rest) });
    } else {
      out.push({ method: "OTHER", text: line });
    }
  }
  return out;
}


const SPAN_RE = /«([^»]+)»/g;

/** Extract the quoted spans of a change line, per method. Tolerant: any
 *  shape that does not match the contract yields no spans. */
function parseSpans(
  method: EditMethod,
  rest: string,
): Pick<StructuredChange, "before" | "after"> {
  const spans = [...rest.matchAll(SPAN_RE)].map((m) => m[1] ?? "");
  if (method === "REPLACE" && spans.length >= 2) {
    return { before: spans[0], after: spans[1] };
  }
  if (method === "ADD" && spans.length >= 1) {
    return { after: spans[0] };
  }
  return {};
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
