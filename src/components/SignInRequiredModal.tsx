'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface SignInRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which locked feature triggered the modal — used for copy. */
  feature?: string;
  /** Override the full modal title. When set, `feature` is ignored for the title. */
  title?: string;
}

export function SignInRequiredModal({
  isOpen,
  onClose,
  feature = 'this feature',
  title,
}: SignInRequiredModalProps) {
  const titleId = useId();

  return (
    <Modal isOpen={isOpen} onClose={onClose} titleId={titleId} maxWidthClass="max-w-sm">
      <div className="p-0">
        {/* Icon */}
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#4552FF]/10 ring-1 ring-[#4552FF]/20">
            <Bookmark className="h-5 w-5 text-[#4552FF]" strokeWidth={2} />
          </div>
          <div>
            <h2
              id={titleId}
              className="font-heading text-lg font-semibold text-[#E7E6D9]"
            >
              {title ?? `Sign in to use ${feature}`}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#888]">
              Create a free account to save your prompt library, view history
              across devices, and unlock unlimited optimizations.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          <Link
            href="/signup"
            onClick={onClose}
            className="flex h-10 w-full items-center justify-center rounded-xl bg-[#4552FF] text-sm font-semibold text-white transition hover:opacity-90"
          >
            Create free account
          </Link>
          <Link
            href="/login"
            onClick={onClose}
            className="flex h-10 w-full items-center justify-center rounded-xl border border-[#2a2a2a] bg-transparent text-sm font-medium text-[#ccc] transition hover:border-[#3a3a3a] hover:bg-[#111]"
          >
            Log in
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 text-xs text-[#555] transition hover:text-[#888]"
          >
            Maybe later
          </button>
        </div>
      </div>
    </Modal>
  );
}
