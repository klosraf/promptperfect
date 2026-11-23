/**
 * Local, deterministic prompt analysis — no model call, no network.
 *
 * Two products in one pass over the draft:
 *  - a lint catalogue (vague terms, missing output format, missing
 *    constraints, missing success criteria, …), each finding carrying a
 *    one-click scaffold fix where one exists;
 *  - dimension scores (clarity, specificity, structure, context,
 *    constraints) computed from transparent heuristics. These are local
 *    heuristics, not a model's judgement, and the UI labels them as such.
 *
 * Cues are bilingual (EN/ES): the product's audience writes both.
 */

export type LintSeverity = "high" | "medium" | "low" | "info";
export type PromptDimension =
  | "clarity"
  | "specificity"
  | "structure"
  | "context"
  | "constraints";

export interface LintFinding {
  id: string;
  dimension: PromptDimension;
  severity: LintSeverity;
  message: string;
  /** Label for the one-click fix button, when a scaffold fix exists. */
  fixLabel?: string;
  /** Scaffold fix: returns the new prompt text. Placeholders stay bracketed. */
  fix?: (text: string) => string;
}

export interface PromptAnalysis {
  scores: Record<PromptDimension, number> & { overall: number };
  findings: LintFinding[];
  variables: string[];
  /** Rough token estimate (~4 chars/token). An estimate, never a count. */
  tokens: number;
  words: number;
}

const VAGUE_TERMS = [
  "something",
  "stuff",
  "things",
  "whatever",
  "good",
  "nice",
  "algo",
  "cosas",
  "bueno",
  "bonito",
];

const FORMAT_CUES =
  /\b(format|output|respond|return|list|table|json|paragraph|bullet|structure|formato|salida|responde|devuelve|lista|tabla|estructura)\b/i;
const CONSTRAINT_CUES =
  /\b(must|must not|do not|don't|never|always|limit|under|at most|exactly|only|no debe|nunca|siempre|l[ií]mite|m[aá]ximo|exactamente|solo|solamente)\b/i;
const SUCCESS_CUES =
  /\b(success|successful|done when|complete when|ready when|[eé]xito|listo cuando|completo cuando|correcto cuando)\b/i;
const AUDIENCE_CUES =
  /\b(audience|reader|readers|user|users|for a|for an|beginner|expert|audiencia|lector|lectores|usuario|usuarios|principiante|experto)\b/i;
const EXAMPLE_CUES =
  /\b(example|for instance|e\.g\.|ejemplo|por ejemplo)\b/i;

function appendSection(text: string, section: string): string {
  const base = text.replace(/\s+$/u, "");
  return `${base}\n\n${section}`;
}

export function extractVariables(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g)) {
    if (m[1]) seen.add(m[1]);
  }
  return [...seen];
}

/** Replace {{variables}} with supplied values; unknown ones stay as-is. */
export function compileTemplate(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (whole, name) => {
    const v = values[name as string];
    return v === undefined || v === "" ? whole : v;
  });
}

/** Rough token estimate (~4 chars per token). Labelled an estimate in UI. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function analyzePrompt(raw: string): PromptAnalysis {
  const text = raw ?? "";
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const variables = extractVariables(text);
  const findings: LintFinding[] = [];
  const penalties: Record<PromptDimension, number> = {
    clarity: 0,
    specificity: 0,
    structure: 0,
    context: 0,
    constraints: 0,
  };
  const penalize = (d: PromptDimension, sev: LintSeverity) => {
    penalties[d] += sev === "high" ? 35 : sev === "medium" ? 20 : sev === "low" ? 10 : 0;
  };
  const add = (f: LintFinding) => {
    findings.push(f);
    penalize(f.dimension, f.severity);
  };

  if (trimmed.length === 0) {
    return {
      scores: { clarity: 0, specificity: 0, structure: 0, context: 0, constraints: 0, overall: 0 },
      findings: [],
      variables: [],
      tokens: 0,
      words: 0,
    };
  }

  if (trimmed.length < 24 || words < 5) {
    add({
      id: "too-short",
      dimension: "specificity",
      severity: "high",
      message:
        "This draft is very short — the model will have to guess the task, the audience and the shape of a good answer.",
    });
  }

  const lower = trimmed.toLowerCase();
  const vagueHits = VAGUE_TERMS.filter((t) =>
    new RegExp(`\\b${t}\\b`, "i").test(lower),
  );
  if (vagueHits.length > 0) {
    add({
      id: "vague-terms",
      dimension: "clarity",
      severity: vagueHits.length > 2 ? "medium" : "low",
      message: `Vague wording (${vagueHits.slice(0, 3).join(", ")}) leaves the result open to interpretation — name the thing, the amount or the standard instead.`,
    });
  }

  if (!FORMAT_CUES.test(trimmed)) {
    add({
      id: "no-output-format",
      dimension: "specificity",
      severity: "medium",
      message:
        "No output format is specified — the answer's shape (list, table, paragraphs, JSON…) will be improvised.",
      fixLabel: "Add format scaffold",
      fix: (t) =>
        appendSection(
          t,
          "Output format: [describe the shape of the answer — e.g. a short intro, then a bullet list, then one closing line].",
        ),
    });
  }

  if (!CONSTRAINT_CUES.test(trimmed)) {
    add({
      id: "no-constraints",
      dimension: "constraints",
      severity: "medium",
      message:
        "No constraints or boundaries are stated — length, tone, exclusions and must-avoid topics are all undecided.",
      fixLabel: "Add constraints scaffold",
      fix: (t) =>
        appendSection(
          t,
          "Constraints: [add the limits the answer must respect — length, tone, what to avoid].",
        ),
    });
  }

  if (!SUCCESS_CUES.test(trimmed)) {
    add({
      id: "no-success",
      dimension: "specificity",
      severity: "low",
      message:
        "Nothing says what a successful result looks like, so neither you nor the model can check the answer.",
      fixLabel: "Add success scaffold",
      fix: (t) =>
        appendSection(
          t,
          "Success looks like: [describe how you will know the result is right].",
        ),
    });
  }

  if (!AUDIENCE_CUES.test(trimmed) && words < 120) {
    add({
      id: "no-audience",
      dimension: "context",
      severity: "low",
      message:
        "The audience and its assumed knowledge are not named — expect over- or under-explaining.",
    });
  }

  if (words > 120 && !EXAMPLE_CUES.test(trimmed)) {
    add({
      id: "no-examples",
      dimension: "context",
      severity: "low",
      message:
        "A long, detailed prompt with no example — one concrete example usually pins the expected style better than more description.",
    });
  }

  const capsWords = trimmed
    .split(/\s+/)
    .filter((w) => w.length > 2 && w === w.toUpperCase() && /[A-ZÁÉÍÓÚ]/.test(w));
  if (words > 12 && capsWords.length / words > 0.35) {
    add({
      id: "shouting",
      dimension: "clarity",
      severity: "low",
      message:
        "A large share of the draft is ALL-CAPS — emphasis everywhere reads as emphasis nowhere.",
    });
  }

  if (variables.length > 0) {
    findings.push({
      id: "variables",
      dimension: "structure",
      severity: "info",
      message: `${variables.length} template variable${variables.length === 1 ? "" : "s"} detected (${variables.map((v) => `{{${v}}}`).join(", ")}) — fill in test values below to preview the compiled prompt.`,
    });
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  // Structure earns a small bonus for visible organisation (lines/sections),
  // which pure penalty scoring cannot see.
  const lineCount = trimmed.split("\n").filter((l) => l.trim()).length;
  const structureBonus = lineCount >= 3 ? 10 : lineCount === 2 ? 5 : 0;
  const scores = {
    clarity: clamp(100 - penalties.clarity),
    specificity: clamp(100 - penalties.specificity),
    structure: clamp(100 - penalties.structure + structureBonus),
    context: clamp(100 - penalties.context),
    constraints: clamp(100 - penalties.constraints),
    overall: 0,
  };
  scores.overall = clamp(
    (scores.clarity +
      scores.specificity +
      scores.structure +
      scores.context +
      scores.constraints) /
      5,
  );

  return { scores, findings, variables, tokens: estimateTokens(text), words };
}
