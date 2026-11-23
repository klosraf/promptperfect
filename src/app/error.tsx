'use client'

import Link from 'next/link'
import { useEffect } from 'react'

// NOTE: dev-only console.error is intentional here (standard Next.js error
// pattern). Server routes use the structured logger in `lib/logger.ts`; a
// client ingest endpoint was deliberately not added (no backend in local
// mode, extra attack surface in prod).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-xl font-semibold text-foreground">Something went wrong.</h2>
      <p className="text-sm text-muted-foreground">
        Try again, or head back to the home page. If it keeps happening, ping us in Discord.
      </p>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-[10px] cta-gradient px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-[10px] border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-input hover:bg-muted"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
