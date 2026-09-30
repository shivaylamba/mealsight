import Link from 'next/link';

/** A plate inside a viewfinder: the product in one glyph. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M3 10V6a3 3 0 0 1 3-3h4M22 3h4a3 3 0 0 1 3 3v4M29 22v4a3 3 0 0 1-3 3h-4M10 29H6a3 3 0 0 1-3-3v-4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="7.5" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="3" fill="#8fae5a" />
    </svg>
  );
}

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="MealSight home">
      <BrandMark />
      <span>
        mealsight<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
