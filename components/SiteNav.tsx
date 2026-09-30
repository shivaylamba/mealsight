'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from '@/components/Brand';

const REPO = 'https://github.com/shivaylamba/mealsight';

const pages = [
  { href: '/', label: 'Overview' },
  { href: '/analyse', label: 'Analyse' },
];

/**
 * One header for every page, so the current page is always marked in the
 * same place. aria-current carries it for screen readers; the style follows.
 */
export function SiteNav({ cta = false }: { cta?: boolean }) {
  const pathname = usePathname();
  return (
    <header className="site-nav">
      <Brand />
      <nav aria-label="Main">
        {pages.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="nav-link"
            aria-current={pathname === href ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
        <a href={REPO} className="nav-link nav-external">
          GitHub <ArrowUpRight size={14} aria-hidden="true" />
        </a>
        {cta && (
          <Link href="/analyse" className="button primary small nav-cta">
            Try it
          </Link>
        )}
      </nav>
    </header>
  );
}
