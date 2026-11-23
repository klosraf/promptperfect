'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. Prefer passing `titleId` from your own heading. */
  titleId?: string;
  /** Fallback accessible name when no visible heading id is available. */
  ariaLabel?: string;
  children: ReactNode;
  /** Panel width class. Defaults to `max-w-md`. */
  maxWidthClass?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

/**
 * Shared modal primitive: overlay + centered panel with `role="dialog"`,
 * Escape-to-close, backdrop-click-to-close, initial focus and body scroll lock.
 * Focus is restored to the previously focused element on close.
 */
export function Modal({
  isOpen,
  onClose,
  titleId,
  ariaLabel,
  children,
  maxWidthClass = 'max-w-md',
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps) {
  const fallbackId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused =
      typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) onCloseRef.current();
      if (e.key === 'Tab') {
        // Focus trap (EGM E4 / WCAG 2.4.3): keep Tab cycling inside
        // the panel instead of leaking to the page behind the dialog.
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabIndex]:not([tabIndex="-1"])',
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) {
          e.preventDefault();
          return;
        }
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog so keyboard/screen-reader users land inside.
    panelRef.current?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [isOpen, closeOnEscape]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId ?? (ariaLabel ? undefined : fallbackId)}
      aria-label={titleId ? undefined : ariaLabel}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      {!titleId && !ariaLabel ? (
        <span id={fallbackId} className="sr-only">
          Dialog
        </span>
      ) : null}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`w-full ${maxWidthClass} rounded-xl border border-border bg-card p-8 shadow-2xl outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
