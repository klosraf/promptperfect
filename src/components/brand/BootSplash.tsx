import { Logo } from "@/components/brand/Logo";

/**
 * Branded boot splash — the first-paint and route-loading surface.
 *
 * Honesty rules: the indicator is indeterminate (a gradient sweep, never a
 * percentage), because route loading has no measurable progress to report;
 * the splash is shown by the router exactly while the route is loading
 * (loading.tsx), never on a timer. Motion collapses under
 * prefers-reduced-motion via the global rule in globals.css.
 */
export function BootSplash({ label = "Loading PromptPerfect" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex min-h-screen flex-col items-center justify-center gap-7 bg-background px-6"
    >
      <div className="pp-splash-mark">
        <Logo size={76} />
      </div>
      <div className="flex flex-col items-center gap-4">
        <p className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
          PromptPerfect
        </p>
        <p className="text-center text-[13.5px] font-medium text-accent-text">
          Optimize your prompts. Understand every change.
        </p>
        <div className="pp-splash-bar" aria-hidden="true">
          <span />
        </div>
        <span className="sr-only">{label}…</span>
      </div>
    </div>
  );
}
