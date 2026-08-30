# Writeup

## Architecture

Six stages, one of which talks to a model:

```
reviews.json → ingest → junk filter → dedup → LLM extract → aggregate → eval
                        └── deterministic, testable ──┘   └─ Postgres ─┘
```

Everything cheap and rule-shaped happens before the model call. The junk filter
and the deduplicator are pure functions with unit tests; the model is asked only
for the thing that genuinely needs judgment — what a review is complaining
about, how badly, and whether it is spam.

The shared vocabulary — the issue taxonomy, the severity rubric, the API DTOs —
lives in `packages/contracts` as Zod schemas. The same schema that constrains
the model's structured output types the API response and the React components,
so a taxonomy change is a compile error rather than a silent mismatch.

Results are persisted in Postgres keyed by `(review, prompt version)` with the
text hash, which makes re-runs idempotent and free. That is also what lets the
repo ship a committed `data/snapshot.json`: `pnpm seed` runs the real pipeline
and replays the model's answers, so the UI works from a clean clone with no API
key. It is the same orchestration code with one substituted dependency, not a
second code path.

---

## The three decisions that mattered

### 1. A closed issue taxonomy, not free-form topics

The corpus contains about 102 distinct complaint and praise clauses. Asked for
free-form topics, a model returns "login issues", "can't log in", and "auth
problem" for the same thing, and a "top issues" count built on that is
meaningless.

So the model picks a `category` from a closed list of 12 (plus `other`), and
*also* returns a free-form `label` and a verbatim `quote`. Counting groups on
the stable category; the UI shows the specific wording people actually used. The
`other` bucket is the escape hatch and doubles as a drift sensor — if it grows,
the taxonomy needs another category.

**Trade-off:** the taxonomy was derived from this corpus, so it fits it well and
would need revisiting for a different product line. The cost of being wrong is
visible (`other` grows) rather than silent (counts fragment).

### 2. Deduplication is scoped per product, and the threshold was measured

This dataset contains identical text attached to *different* products — "Great
product overall. The design is gorgeous." appears under both FreshCrate and
AeroBuds. Those are not one person cross-posting; they are separate signals
about separate products, and merging them corrupts exactly the per-product
counts the report exists to produce.

Measured on the provided data:

| Strategy | Rows collapsed (of 290 usable) |
|---|---|
| Global near-duplicate matching | **56 (19%)** — merges different products |
| Scoped to a single product | **15**, in 12 clusters, 10 of them spanning channels |

The similarity threshold is not a guess either. I read every pair in the corpus
scoring above 0.60 trigram similarity (43 pairs) and judged each by hand. Real
cross-posts differ only by typos and punctuation and score ≥ 0.92; the hardest
*non*-duplicate — two reviews sharing a complaint clause under different
openers — scores 0.806. The outcome is stable anywhere in 0.84–0.92, so 0.88
sits in the middle of a plateau rather than on a cliff. Those judgments are
committed as `expectedDuplicateClusters` and `expectedNotDuplicates` in the gold
set, so the eval scores dedup against hand-labelled positives *and* negatives.

### 3. The star rating is ignored as a signal

**27% of rated reviews carry a rating that contradicts their own text** — a
five-star "Really disappointed. First, crashes every time I open it. On top of
that, billed after I cancelled." The rating is deliberately not shown to the
model, so it cannot anchor on it. It is displayed in the UI as metadata, and the
contradiction rate is displayed on the dashboard, because "the stars are lying
to you" is itself a finding a product owner should see.

Product and channel *are* passed to the model — they disambiguate complaints
like "won't hold a charge".

---

## What the numbers look like

Of 300 reviews: 9 contentless, 3 spam, 15 cross-posts merged into 12 clusters,
**273 counted**. All 8 non-English reviews are classified rather than dropped,
and each carries an English one-liner so an English-speaking reader can act on
a Portuguese or Chinese complaint.

The UI shows what was removed and why, behind one click. A report that quietly
drops 27 of 300 rows is not trustworthy; one that hands you the 27 is.

A full run over the corpus on `claude-opus-5` takes **98 seconds and costs
$1.08** — 14 batched structured-output calls, 23k input tokens with a further
42k served from the prompt cache, 39k out. Cheap enough that re-running after a
taxonomy change is a non-decision.

**The taxonomy held.** Across all 273 counted reviews the model never used the
`other` bucket — every piece of feedback landed in one of the 12 real
categories. That is the drift sensor reading zero, and the strongest evidence
the closed list was drawn in the right places for this corpus.

## The eval

Scored against the 20 hand-labelled reviews, on `claude-opus-5`:

| Axis | Result |
|---|---|
| Spam / junk detection | P 100% · R 100% · F1 100% |
| Duplicate detection | P 100% · R 100% · F1 100% (18 pairs, 0 false merges) |
| Sentiment accuracy | 100% (16/16) |
| Severity, exact | **93.8% (15/16)** |
| Severity, within one level | 100% |
| Language detection | 100% |
| Issue categories, micro | P 100% · R 100% · F1 100% (27 labels) |

Self-reported confidence ranged 0.78–0.95 (mean 0.90), against the keyword
mock's flat 0.5 — the model differentiates where it is unsure, which is what
makes confidence routing (below) worth building.

Read those numbers with the sample size in mind: **16 scored reviews is enough
to catch a broken system, not enough to certify a good one.** The interval
around 100% on n=16 is wide. What the set is really for is the failure list,
and it produced exactly one.

### The one disagreement, in full

> "Really disappointed. First, left earbud stopped working after a week. On top
> of that, rude agent on the phone. Fix this."

Both of us extracted the same two categories. I labelled the review **high**;
the model said **critical**, because it read "left earbud stopped working" as
"a dead product", which is the literal wording of my own rubric.

The model is arguably right and my rubric is the thing that is wrong: it never
says whether half a dead product counts. I have left the gold label alone rather
than move it to match — fitting the label to the answer would turn the eval into
a mirror. It is recorded here instead, because a rubric that two careful readers
apply differently is a rubric that needs another sentence, and that is a more
useful finding than a 100% score would have been.

### What the model caught that rules could not

The junk filter is deterministic and the spam call is the model's. That split
paid for itself immediately: the model flagged a third spam review the keyword
rules missed —

> "buy cheap followers dm me @growthhackz"

No URL, no "free", no dollar sign, no crypto. Nothing a regex written against
the other two spam rows would ever fire on. Meanwhile the same rules would have
wrongly binned five legitimate reviews complaining that "the free tier is
basically useless now". That asymmetry — cheap rules for the mechanical part,
the model for the judgment — is the whole argument for the pipeline's shape.

---

## Where it fails, and why

- **Severity is the weakest axis.** It is a judgment call against a written
  rubric, and the boundary between "high" and "critical" moves depending on
  whether the reviewer states an actual consequence. The eval reports severity
  both exactly and within one level for this reason.
- **Sarcasm and mixed-signal reviews are the fragile ones.** "Oh fantastic,
  another crash right in the middle of my presentation" and "Food quality is
  excellent when it arrives; the problem is it's late half the time" both came
  out correctly on this run, but they are the shapes where a wrong reading is
  most likely and where `other` would absorb the failure quietly.
- **The dedup ground truth is the shakiest label in the gold set.** "Frustrated.
  Ingredients were spoiled on arrival." and "Really disappointed. Ingredients
  were spoiled on arrival." are the same complaint with different openers. I
  ruled them *not* cross-posts on the grounds that a cross-post is the same text
  re-posted, so only typos and punctuation may differ. That line is defensible
  but it is a line, and a different labeller would draw it elsewhere.
- **The keyword mock's eval score is meaningless** and the eval says so on
  screen when it detects one. Its rules and the gold labels came from the same
  reading of the same corpus by the same person, so it scores 100% on
  everything. Only the model run produces a number worth quoting; the mock
  exists so the repo runs without credentials, not to be measured.
- **Channel mix is computed from the canonical review only**, so an issue
  cross-posted to three channels counts once against one channel in the
  breakdown. The drill-down shows the full channel list per review; the rollup
  does not.

---

## What I deliberately cut

- **Auth, deployment, multi-tenancy** — out of scope per the brief.
- **Migration history.** `drizzle-kit push` against a fresh database, not
  generated migrations. Right for a take-home, wrong for anything deployed.
- **Trends over time.** The dataset has no timestamps, so a "rising issue" view
  would be fiction.
- **Clustering the `other` bucket.** A second pass could group the leftovers
  into candidate new categories; with 7 rows in it, not worth the code.
- **A pipeline-run button in the UI** with streamed progress. The CLI prints
  everything, and a progress UI is demo polish rather than product.
- **Virtualisation and pagination.** 12 issue rows and at most ~40 reviews per
  sheet. Worth adding when the corpus is large enough to need it.
- **Automated integration tests for the pipeline.** Idempotency is verified by
  running the CLI three times and diffing the counts, not by a test that needs
  a database. The pure stages are unit-tested.
- **Aggregation in SQL.** The joined set is a few hundred rows, so the ranking
  and example-selection rules live in readable TypeScript instead of window
  functions. At a million rows this becomes a `GROUP BY` with a lateral join.

## Two things I would not ship as they are

The stack is heavier than 300 reviews justify — Turborepo, Nest, Postgres,
Drizzle, feature-sliced React, shadcn/ui. I built it that way because the shape of the
problem is "this will grow", not because 300 rows need it. For the take-home
alone, a single script and a static page would have been a defensible answer.

And `severity` on a review is the worst of its issues, which is right, but the
first version of the aggregation ranked *categories* by review-level severity.
That made every row read "Critical", because any review mentioning a critical
problem dragged all of its other categories up with it. Severity is now
extracted per issue. It was only visible once the table was on screen.

---

## Another week

1. **Per-issue severity calibration.** Label 100 reviews rather than 20 and tune
   the rubric wording until the model's severity distribution matches a human's.
   20 labels is enough to catch a broken system, not enough to tune one.
2. **Cluster the `other` bucket** into proposed new categories and surface them
   as "the taxonomy is missing these" — the loop that keeps this useful after
   the product changes.
3. **Cross-run diffing.** Store runs (already modelled) and show what moved:
   which issue grew, which quote is new. That is the view that makes this a
   weekly habit rather than a one-off report.
4. **Confidence routing.** The model already reports confidence. Route anything
   below 0.6 to a second pass at higher effort, and show low-confidence rows as
   "needs a human" in the UI rather than burying them in the counts.
5. **Model comparison in the eval.** Run Opus, Sonnet and Haiku over the same
   gold set and put the three columns next to the cost. The scaffolding for this
   exists — it is one env var and a second snapshot file.
