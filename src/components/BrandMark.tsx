/**
 * Covenant glyph — two nodes (agent · capability) bound by a sealed link.
 * The seal in the center is the proof. Drawn, not a stock icon.
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <linearGradient id="cv-g" x1="4" y1="6" x2="36" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5FFCE0" />
          <stop offset="1" stopColor="#7C5CFF" />
        </linearGradient>
      </defs>
      <circle cx="9" cy="20" r="5.2" stroke="url(#cv-g)" strokeWidth="2.2" />
      <circle cx="31" cy="20" r="5.2" stroke="url(#cv-g)" strokeWidth="2.2" />
      <path d="M14 20 H26" stroke="url(#cv-g)" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M20 11.5 L24 20 L20 28.5 L16 20 Z"
        fill="#05070b"
        stroke="url(#cv-g)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="20" r="1.7" fill="#5FFCE0" />
    </svg>
  );
}
