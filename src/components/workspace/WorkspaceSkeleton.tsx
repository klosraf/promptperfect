import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Loading skeleton for the workspace route — mirrors the real layout
 * (fixed h-14 header, mt-14 main, two editor columns, centered controls)
 * so the arriving UI replaces it without layout shift.
 */
export function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading workspace" className="min-h-screen bg-background">
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background px-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 rounded-[8px]" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <main className="mt-14 px-6 pt-6">
        <div className="flex w-full flex-col gap-5 lg:flex-row">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-[340px] w-full rounded-[12px]" />
          </div>
          <div className="min-w-0 flex-1">
            <Skeleton className="h-[340px] w-full rounded-[12px]" />
          </div>
        </div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Skeleton className="h-10 w-40 rounded-full" />
          <Skeleton className="h-11 w-44 rounded-full" />
          <Skeleton className="h-10 w-32 rounded-full" />
        </div>
      </main>
      <span className="sr-only">Loading workspace…</span>
    </div>
  );
}
