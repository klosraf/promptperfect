import { Logo } from "@/components/brand/Logo";
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export function LandingHeader() {
  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <Logo size={26} className="shrink-0" />
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          PromptPerfect
        </h1>
        <p className="text-sm text-muted-foreground">
          by{' '}
          <a
            href="https://beaglecorp.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            Beagle
          </a>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <Link href="/app" className="cursor-pointer">
          <Button size="sm">Try for free</Button>
        </Link>
        <Link href="/login" className="cursor-pointer">
          <Button size="sm" variant="outline">
            Log in
          </Button>
        </Link>
      </div>
    </header>
  );
}

