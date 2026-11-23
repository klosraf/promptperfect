import { LibrarySkeleton } from "@/components/library/LibraryStates";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-3 h-4 w-72" />
        <div className="mt-8">
          <LibrarySkeleton />
        </div>
      </div>
      <span className="sr-only">Loading your library…</span>
    </div>
  );
}
