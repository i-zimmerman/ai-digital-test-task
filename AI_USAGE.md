# AI usage

> The 20 labels in `data/gold-labels.json` are mine — I read each one and signed
> the file. Where the model and I disagreed on the final run (once, on severity),
> I left my label alone rather than move it to match; the disagreement is written
> up in `WRITEUP.md` instead.

## Tools

- **Claude Code (Claude Opus 5)** — the main tool. Used for the data analysis,
  the implementation, and the debugging.
- **The `shadcn` CLI** to scaffold the UI primitives into `shared/ui`, and
  vendored component documentation grepped locally rather than recalled — see
  the third mistake below.
- The **Anthropic TypeScript SDK reference** for the structured-output call
  (`messages.parse` + `zodOutputFormat`), rather than writing the request shape
  from memory.

## Delegated vs. decided

**Delegated:** all of the implementation — the Nest modules, the Drizzle schema,
the React components, the CLI scripts, the tests. Also the exploratory data
analysis: counting the corpus, extracting the ~102 distinct complaint clauses,
measuring duplicate clusters at different thresholds, computing the
rating/sentiment contradiction rate.

**Decided (and repeatedly overrode):** the stack and the architecture. That the
taxonomy is closed rather than free-form. That dedup is scoped per product. That
the star rating is not shown to the model. That the repo must run without an API
key. That severity belongs on the issue, not the review. The analysis produced
the numbers; the calls about what to do with them were the point of the exercise.

The most useful pattern was **making the AI measure instead of assert.** Where
the first instinct is "0.85 is probably a good similarity threshold", the actual
work was: implement the metric, sweep it across the corpus, print the cluster
counts at each value, and read the pairs that sit near the boundary. That turned
a guess into a plateau with a defensible midpoint — and it is the same reason
the gold set contains hand-picked *negative* duplicate pairs, not just positives.

## Example prompts

**1. Ground the design in the data, not in assumptions.**

> Before writing any code, analyse `reviews.json` end to end. I want to know what
> is actually in it: distribution across products, channels, languages, ratings;
> text length; how many exact and near-duplicates and whether they cross product
> boundaries; how many rows are spam vs contentless; and whether the star ratings
> agree with the sentiment of the text. Show me the numbers and the specific rows
> behind each finding, not a summary.

This is what surfaced the two findings the whole design rests on: near-identical
text attached to different products, and 27% of ratings contradicting their own
review.

**2. Force the threshold to be measured rather than chosen.**

> Don't pick a dedup similarity threshold. Implement trigram Dice similarity,
> then sweep the threshold from 0.80 to 1.0 over the real corpus and print, at
> each step, the number of clusters and rows collapsed — for both product-scoped
> and global matching. Then print every pair scoring above 0.60 with full text so
> I can judge the borderline ones myself.

**3. Verify against the docs, not against recall.**

> This component library shipped after your training data was fixed. Fetch its
> published documentation bundle and grep it for the actual component APIs before
> writing any JSX. If you cannot find a component's real prop signature in that
> file, say so instead of guessing.

## Where the AI got it wrong

**The bug that mattered: a re-run silently un-excluded the spam.**

The pipeline's ingest stage upserts every review and recomputes its status. That
looked correct in isolation, but `spam` is set two stages later by the model, and
`duplicate` by the deduplicator. So the second run overwrote both back to `ok` —
and because extraction results are cached and reused, nothing put them back. The
report grew from 274 counted reviews to 276, with the crypto-airdrop spam
quietly back in the numbers.

Nothing failed. No exception, no test, no red text — just two extra rows.

It surfaced because I ran the pipeline three times in a row and diffed the
printed counts instead of running it once and reading the output. The fix was to
make ingest recompute only the junk verdict and leave the downstream statuses
alone, and to change the summary to count statuses from the database rather than
accumulate them as deltas — the delta version reported "spam removed: 0" on a
cached run, which was the tell.

The same class of bug was hiding in the deduplicator, which cleared
`status_reason` on every canonical row on every pass, wiping the spam
explanations. Found by querying the table directly rather than trusting the
summary line.

**Two more, both caught by looking rather than reading:**

- **Severity was attached to the wrong thing.** The first aggregation ranked
  issue categories by the *review's* severity, so any review mentioning one
  critical problem dragged all of its other categories to "critical" too. Every
  row in the table read Critical, including "Missing features" — which is what
  gave it away, on screen, after the API tests had all passed. Severity is now
  extracted per issue and the ranking is meaningful.
- **Component APIs were recalled wrong.** The first UI pass was built on a
  library released after the model's cutoff, and the confidently recalled prop
  names were wrong in three places — `Select` took `value`/`onChange` rather
  than React Aria's `selectedKey`/`onSelectionChange`, `Alert` took `status`
  rather than `variant`, and `Switch` needed a compound child. Every one came
  from grepping the library's own published docs; the typechecker caught the
  stragglers. That whole UI was later replaced with shadcn/ui, which sidesteps
  the problem differently: the components are scaffolded into the repo as
  source, so their real API is in the working tree rather than in anyone's
  memory. The general lesson stands — for anything released after the cutoff,
  treat recall as a hypothesis.

**The silent one: a config file that was never being read.**

Everything in the app is configured through a root `.env`. The API scripts run
from `apps/api`, and `dotenv` resolves its default path against the working
directory — so `apps/api/.env`, which does not exist. The root file was never
loaded, not once.

Nothing broke, for days. Every setting in `src/config.ts` has a fallback, and
each fallback happened to be identical to the value in the file: same database
URL, same port, same model, same batch size. The pipeline ran, the tests passed,
the UI worked. The bug only surfaced the moment a value appeared that has no
sensible default — the API key — and the very first real model call failed with
"Could not resolve authentication method".

The lesson I would keep: **a default that matches the config is a default that
hides whether the config is being read at all.** The fix was to resolve `.env`
from the workspace root explicitly, in both the app and the Drizzle config.

**And one I did not catch: the drill-down panel could not be scrolled.**

The reviews behind an issue open in a side panel. Only the first four were ever
reachable — the rest were rendered, present in the DOM, and clipped. The cause
is a one-line CSS default: a flex child gets `min-height: auto`, so the scroll
container grew to fit its contents instead of shrinking to the panel and
scrolling inside it. `min-h-0` fixes it.

I had "verified" that panel twice, with an accessibility snapshot and a
screenshot. Neither can see this bug: the snapshot lists every card because they
all exist, and the screenshot shows the top of the list, which looks correct.
**Both of my checks answered "did it render" when the question was "does it
work".** The user found it in about a minute of actually using the thing. The
check I should have run — and now do — is to script the scroll and assert the
container reaches its own bottom.

**One tooling dead end worth recording.** Running Nest under `tsx` broke
dependency injection, because esbuild does not emit `emitDecoratorMetadata`, so
Nest could not resolve constructor types. Switching the runtime to SWC fixed
that and then panicked inside its own diagnostic renderer on any file importing
the HTTP adapter. Rather than keep chasing a third-party transpiler bug, the fix
was to remove the dependency on decorator metadata entirely: two controllers now
name their provider with an explicit `@Inject()` token, and the app runs under
any transpiler. Fifteen minutes of debugging replaced by two lines.
