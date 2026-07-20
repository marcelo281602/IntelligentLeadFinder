/**
 * The LeadFinder mark: a finder lens locked onto a lead (cyan dot) on the
 * brand's deep-blue tile. Inline SVG so it inherits no external requests and
 * stays crisp at any size. Colors come from the centralized brand palette.
 */
export function BrandMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="LeadFinder logo"
      className={className}
    >
      <defs>
        <linearGradient id="lf-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#33567f" />
          <stop offset="1" stopColor="#263f64" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#lf-tile)" />
      <circle cx="28.5" cy="28.5" r="13" fill="none" stroke="#ffffff" strokeWidth="5.5" />
      <circle cx="28.5" cy="28.5" r="5" fill="#3ba7c4" />
      <line
        x1="38.5"
        y1="38.5"
        x2="48.5"
        y2="48.5"
        stroke="#ffffff"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
