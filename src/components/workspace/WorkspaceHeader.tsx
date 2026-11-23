'use client';

import { Logo } from "@/components/brand/Logo";
import Link from 'next/link';
import type { AppUser } from '@/lib/types';
import { isUnlimitedMode } from '@/lib/localMode';
import { UserAccountMenu } from '@/components/UserAccountMenu';
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export interface WorkspaceHeaderProps {
  user: AppUser | null;
  signingOut: boolean;
  onOpenSettings: () => void;
  onRequireSignIn: () => void;
  onLogout: () => void;
}

const NAV_LINK_CLASS =
  'rounded-lg border border-transparent px-3 py-1.5 text-sm text-muted-foreground transition-all duration-200 ease-out hover:border-border hover:bg-muted hover:text-foreground';

/**
 * Fixed top bar for the `/app` workspace. Authenticated users get Library /
 * Settings / account menu; guests get Library (gated), Log in, and Sign up.
 * Extracted from `src/app/app/page.tsx` — markup preserved verbatim.
 */
export function WorkspaceHeader({
  user,
  signingOut,
  onOpenSettings,
  onRequireSignIn,
  onLogout,
}: WorkspaceHeaderProps) {
  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex h-14 shrink-0 items-center border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex w-full min-w-0 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-heading"
        >
          <Logo size={26} className="shrink-0" />
          <span className="text-lg font-bold tracking-tight text-foreground">
            PromptPerfect
          </span>
          <span className="text-sm text-muted-foreground">by Beagle</span>
        </Link>
        <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
          <ThemeToggle />
          {user ? (
            <>
              <Link href="/library" className={NAV_LINK_CLASS}>
                Library
              </Link>
              <button
                type="button"
                onClick={onOpenSettings}
                className={NAV_LINK_CLASS}
                aria-label="Settings"
              >
                ⚙️ Settings
              </button>
              <UserAccountMenu
                key={user.id}
                userId={user.id}
                fallbackDisplayName={
                  user.name?.trim() ||
                  user.email.split('@')[0] ||
                  user.email ||
                  'there'
                }
                onLogout={onLogout}
                signingOut={signingOut}
              />
            </>
          ) : (
            <>
              {isUnlimitedMode() ? (
                <Link href="/library" className={NAV_LINK_CLASS}>
                  Library
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onRequireSignIn}
                  className={NAV_LINK_CLASS}
                >
                  Library
                </button>
              )}
              <Link href="/login" className={NAV_LINK_CLASS}>
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-95"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
