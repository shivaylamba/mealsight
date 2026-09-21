# Contributing

Thanks for looking. This is a small project and the bar is the same for
everyone, including me.

## Setup

```bash
npm install
cp .env.example .env.local     # add NEBIUS_API_KEY
npm run dev
```

`GET /api/health` tells you which variables are still missing. Voice is
optional; without `GRADIUM_API_KEY` the app works by typing and says so.

## Before opening a pull request

```bash
npm run lint         # must be 0 errors
npm run typecheck
npm test
npm run build
```

## What makes a change easy to accept

**Say what evidence moved a threshold.** The numbers in `lib/gate.ts` are not
preferences. They came from running the same cases across many models and
watching which signal actually separated food from everything else. If you
change one, show what you ran.

**Add a test for the failure, not the fix.** The interesting tests here are the
ones that describe a way to be wrong: a car accepted as food, a nutrition field
smuggled past the schema, a description that escapes its delimiter. A test named
after the bug outlives the fix.

**Comments explain why.** The code mostly says what it does. A comment earns its
place by recording a decision or a trap, especially where the obvious approach
is the wrong one.

**Keep the model honest.** Two rules hold throughout: the model never returns
nutrition values, and text from a person is evidence rather than instruction. A
change that relaxes either needs a strong argument.

## Good first contributions

- A nutrition-database lookup driven by `lookup_query`, which is in the schema
  for that purpose and currently unused.
- An adapter for another inference provider behind the same interface as
  `lib/nebius.ts`.
- Measuring the gate against models this project has not tried, and reporting
  where the thresholds hold or fail.
- Saving and revisiting meals. There is deliberately no database yet, so the
  shape of that is genuinely open.

## Reporting a problem

Include what you sent, what came back, and which model you configured. Model
behaviour varies enough between models that a report without the model name is
hard to act on.
