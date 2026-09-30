import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import MealSight from '@/components/MealSight';

export const metadata: Metadata = { title: 'Analyse a meal · MealSight' };

export default function AnalysePage() {
  return (
    <div className="app-shell">
      <SiteNav />
      <main id="main" className="app-main">
        <div className="app-heading">
          <p className="eyebrow">
            <span className="tiny-dot" /> Analyse a meal
          </p>
          <h1>What&rsquo;s on the plate?</h1>
          <p className="lead">
            Add a photo, a description, or both. Anything the model is unsure about comes back as a
            question.
          </p>
        </div>
        <MealSight />
      </main>
      <footer className="site-footer">
        <p>Foods and portions only, never calories.</p>
        <p>
          Vision and language by <a href="https://tokenfactory.nebius.com">Nebius Token Factory</a>{' '}
          · Speech by <a href="https://gradium.ai">Gradium</a> · Nothing is stored
        </p>
      </footer>
    </div>
  );
}
