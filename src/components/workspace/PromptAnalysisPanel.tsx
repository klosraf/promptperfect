"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import {
  analyzePrompt,
  compileTemplate,
  type PromptDimension,
} from "@/lib/promptAnalysis";

const DIMENSION_LABEL: Record<PromptDimension, string> = {
  clarity: "Clarity",
  specificity: "Specificity",
  structure: "Structure",
  context: "Context",
  constraints: "Constraints",
};

const SEVERITY_DOT: Record<string, string> = {
  high: "bg-red-400",
  medium: "bg-amber-400",
  low: "bg-[#808088]",
  info: "bg-[#4552ff]",
};

export function PromptAnalysisPanel({
  text,
  onApplyFix,
  disabled = false,
}: {
  text: string;
  onApplyFix: (next: string) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const analysis = useMemo(() => analyzePrompt(text), [text]);

  if (!text.trim()) return null;

  const dimensions = Object.keys(DIMENSION_LABEL) as PromptDimension[];
  const compiled = analysis.variables.length
    ? compileTemplate(text, values)
    : null;

  return (
    <div className="mt-3 rounded-[12px] border border-border bg-popover px-5 py-4">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          <Sparkles className="h-4 w-4 text-accent-text" aria-hidden />
          Prompt analysis
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-foreground">
            {analysis.scores.overall}/100
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
        )}
      </button>

      {expanded && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
            {dimensions.map((d) => (
              <div key={d}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {DIMENSION_LABEL[d]}
                  </span>
                  <span className="text-[11px] font-medium text-foreground-dim">
                    {analysis.scores[d]}
                  </span>
                </div>
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={analysis.scores[d]}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={DIMENSION_LABEL[d]}
                >
                  <div
                    className="h-full rounded-full bg-[#4552ff]"
                    style={{ width: `${analysis.scores[d]}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {analysis.findings.length > 0 && (
            <ul className="mt-4 space-y-2.5">
              {analysis.findings.map((f) => (
                <li key={f.id} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-foreground-dim">
                  <span
                    className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">{f.message}</span>
                  {f.fix && f.fixLabel && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onApplyFix(f.fix!(text))}
                      className="shrink-0 rounded-md border border-border px-2 py-1 text-[12px] font-medium text-accent-text transition hover:border-accent hover:text-white disabled:opacity-50"
                    >
                      {f.fixLabel}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {compiled !== null && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Template variables — test values
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {analysis.variables.map((v) => (
                  <label key={v} className="flex items-center gap-2 text-[13px] text-foreground-dim">
                    <span className="shrink-0 font-mono text-[12px] text-accent-text">{`{{${v}}}`}</span>
                    <input
                      type="text"
                      value={values[v] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [v]: e.target.value }))
                      }
                      disabled={disabled}
                      className="min-w-0 flex-1 rounded-md border border-border bg-muted px-2 py-1 text-[13px] text-foreground outline-none focus:border-accent"
                      placeholder="test value"
                    />
                  </label>
                ))}
              </div>
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-[12.5px] leading-relaxed text-foreground-dim">
                {compiled}
              </pre>
            </div>
          )}

          <p className="mt-4 text-[12px] text-muted-foreground">
            Local heuristic analysis — no model call. ≈{analysis.tokens} tokens ·{" "}
            {analysis.words} words.
          </p>
        </div>
      )}
    </div>
  );
}
