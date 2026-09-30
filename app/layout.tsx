import type { Metadata, Viewport } from 'next';
import { Manrope, Onest } from 'next/font/google';
import './globals.css';

const heading = Manrope({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const body = Onest({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'MealSight',
  description:
    'Photograph a meal and get a structured breakdown you can correct, using open vision and language models.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f7f8f1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
