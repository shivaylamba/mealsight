import MealSight from '@/components/MealSight';

export default function Page() {
  return (
    <main id="main">
      <header>
        <h1>MealSight</h1>
        <p>
          Photograph a meal, or describe it. You get a structured breakdown with the model&rsquo;s
          own confidence attached, and anything it is unsure about is asked rather than assumed.
        </p>
      </header>
      <MealSight />
      <footer>
        <p>
          Vision and language by <a href="https://tokenfactory.nebius.com">Nebius Token Factory</a>.
          Speech by <a href="https://gradium.ai">Gradium</a>. Nothing is stored: images go straight
          to the model and the page forgets everything on reload.
        </p>
        <p>
          MealSight reports foods and portions, never calories or macronutrients. Attaching real
          numbers is a job for a nutrition database, and a model asked for a calorie count will
          produce a confident one whether or not it has any basis for it.
        </p>
      </footer>
    </main>
  );
}
