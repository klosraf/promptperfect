import { useId } from "react";

/**
 * PromptPerfect brand mark — the single in-app source of the logo.
 * Master vector: public/brand/logo.svg (raster assets are generated from it
 * by scripts/brand/build-assets.mjs). The glyph is the product's essence drawn literally: a dim, smaller
 * chevron (the prompt as given) resolved into a larger, full-strength
 * chevron with its cursor (the same prompt, returned better), carrying
 * two short annotation strokes — the explanation that always comes with
 * the improvement. On the brand gradient tile built from the app accent
 * (#4552ff family). No generic sparkle: nothing here could belong to
 * another app.
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
        d="M13.5 23.5 23 32l-9.5 8.5"
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.65}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26.5 20.5 39 32l-12.5 11.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M44.5 24.5h6.5"
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.8}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M44.5 30.5h6.5"
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.8}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M42.5 43.5h8"
        fill="none"
        stroke="#ffffff"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}
