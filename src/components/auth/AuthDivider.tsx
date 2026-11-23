export function AuthDivider() {
  return (
    <div className="flex items-center gap-4 py-1" role="separator" aria-hidden>
      <div className="h-px flex-1 bg-muted" />
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        or
      </span>
      <div className="h-px flex-1 bg-muted" />
    </div>
  )
}
