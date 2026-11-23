import { useId } from "react";

/**
 * PromptPerfect brand mark — the single in-app source of the logo.
 * Master vector: public/brand/logo.svg (raster assets are generated from it
 * by scripts/brand/build-assets.mjs). The glyph is the terminal prompt
 * (chevron + underscore) with the optimization sparkle, on the brand
 * gradient tile built from the app accent (#4552ff family).
 */
export function Logo({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const gradientId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#5b6cff" />
          <stop offset="0.55" stopColor="#4552ff" />
          <stop offset="1" stopColor="#3a45e6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#${gradientId})`} />
      <path
        d="M45 13.5c.9 4.3 2.2 5.6 6.5 6.5-4.3.9-5.6 2.2-6.5 6.5-.9-4.3-2.2-5.6-6.5-6.5 4.3-.9 5.6-2.2 6.5-6.5Z"
        fill="#dfe3ff"
      />
      <path
        d="M23.5 21.5 36 32l-12.5 10.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M41.5 42.5h7"
        fill="none"
        stroke="#ffffff"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
