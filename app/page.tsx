import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Ban,
  Camera,
  Eye,
  MessageCircleQuestion,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Brand } from '@/components/Brand';
import plate from '@/public/plate.jpg';

const REPO = 'https://github.com/shivaylamba/mealsight';

const steps = [
  {
    icon: Camera,
    title: 'Photograph or describe it',
    body: 'Snap the plate, type a line, or just say it. A photo and a sentence together read best.',
  },
  {
    icon: MessageCircleQuestion,
    title: 'It asks what it cannot see',
    body: 'Every food carries its own confidence. Anything uncertain becomes a question, and your answer changes the result.',
  },
  {
    icon: MessagesSquare,
    title: 'Ask about the meal',
    body: 'Question the breakdown in plain language and hear the answer read aloud.',
  },
];

const principles = [
  {
    icon: Sparkles,
    title: 'Asks instead of assuming',
    body: 'A portion it cannot judge is shown as a range, and the least certain item becomes a question.',
  },
  {
    icon: Ban,
    title: 'Never invents calories',
    body: 'A model asked for a calorie count produces a confident one whether or not it has any basis. MealSight reports foods and portions only.',
  },
  {
    icon: Eye,
    title: 'Refuses what is not food',
    body: 'A photo of a car, a bar of soap or a screenshot of text is declined, not described as a meal.',
  },
  {
    icon: ShieldCheck,
    title: 'Keeps nothing',
    body: 'No accounts and no database. Photos go straight to the model, and the page forgets everything on reload.',
  },
];

const stack = [
  {
    name: 'Nebius Token Factory',
    role: 'Vision model',
    detail: 'Reads the plate into foods, portions and confidence.',
  },
  {
    name: 'Nebius Token Factory',
    role: 'Language model',
    detail: 'Answers questions grounded only in the analysed foods.',
  },
  {
    name: 'Gradium',
    role: 'Voice',
    detail: 'Turns speech into a description and reads answers back.',
  },
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="site-nav">
        <Brand />
        <nav aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#principles">Principles</a>
          <a href={REPO} className="nav-external">
            GitHub <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <Link href="/analyse" className="button primary small">
            Try it
          </Link>
        </nav>
      </header>

      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-dot" /> Open source · Nebius + Gradium
            </p>
            <h1>
              Know what&rsquo;s on your plate. <em>And what isn&rsquo;t certain.</em>
            </h1>
            <p className="lead">
              Photograph a meal or describe it. MealSight lists every food with a portion range and
              its own confidence, then asks about whatever it could not see.
            </p>
            <div className="hero-actions">
              <Link href="/analyse" className="button primary">
                Analyse a meal <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <a href={REPO} className="button">
                View the code <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
            <p className="assurance">
              <ShieldCheck size={15} aria-hidden="true" /> No sign-up. Nothing is stored.
            </p>
          </div>

          <div className="hero-visual">
            <Image
              src={plate}
              alt="A bowl of salad with tomatoes, chickpeas, avocado and sweet potato"
              fill
              priority
              sizes="(max-width: 900px) 100vw, 50vw"
              placeholder="blur"
            />
            <div className="visual-shade" />
            <div className="visual-strip">
              <span>Read by a vision model</span>
              <span>01 — A real plate</span>
            </div>
            <div className="sample-card" aria-hidden="true">
              <p className="sample-title">Check this before you trust it</p>
              <ul>
                <li>
                  <span>Chickpeas</span>
                  <span className="pill high">confident · 85%</span>
                </li>
                <li>
                  <span>Sweet potato</span>
                  <span className="pill high">confident · 80%</span>
                </li>
                <li>
                  <span>Dressing</span>
                  <span className="pill medium">unsure · 50%</span>
                </li>
              </ul>
              <p className="sample-question">Was the dressing dairy-based?</p>
              <div className="sample-chips">
                <span>Yes</span>
                <span>No</span>
                <span>Not sure</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="how" aria-labelledby="how-title">
          <p className="eyebrow">01 / How it works</p>
          <h2 id="how-title">Three steps, and it tells you where it is unsure.</h2>
          <ol className="steps">
            {steps.map(({ icon: Icon, title, body }, index) => (
              <li key={title} className="step">
                <span className="step-index">
                  0{index + 1}
                  <Icon size={18} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section principles" id="principles" aria-labelledby="principles-title">
          <div className="principles-intro">
            <p className="eyebrow">02 / Honest by design</p>
            <h2 id="principles-title">A food log that admits what it does not know.</h2>
            <p className="lead">
              Most calorie apps show one number with total confidence. A photo cannot tell you how
              much oil went into the pan, so MealSight says so and asks.
            </p>
          </div>
          <ul className="principle-list">
            {principles.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <Icon size={19} aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="section" aria-labelledby="stack-title">
          <p className="eyebrow">03 / Built with</p>
          <h2 id="stack-title">Open models, swappable by one variable.</h2>
          <ul className="stack">
            {stack.map(({ name, role, detail }) => (
              <li key={role}>
                <p className="stack-role">{role}</p>
                <h3>{name}</h3>
                <p>{detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="cta-band">
          <div>
            <AudioLines size={22} aria-hidden="true" />
            <h2>Try it on your next meal.</h2>
            <p>Free to use here, or clone it and bring your own keys.</p>
          </div>
          <Link href="/analyse" className="button light">
            Analyse a meal <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>
      </main>

      <footer className="site-footer">
        <p>Track less. Understand more. Decide better.</p>
        <p>
          MIT licensed · <a href={REPO}>Source on GitHub</a> · Photo from{' '}
          <a href="https://images.unsplash.com/photo-1512621776951-a57141f2eefd">Unsplash</a>
        </p>
      </footer>
    </div>
  );
}
