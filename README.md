# Review Signal

Turns ~300 messy customer reviews into a "top issues" report a non-technical
person can read, filter, and click through to the underlying feedback.

The dataset (`data/reviews.json`) covers five products across five channels and
is deliberately noisy: typos, six languages, spam, contentless rows, and the
same review cross-posted to several channels.

![The dashboard: issues ranked by how many people raised them](docs/dashboard.png)

Every number is traceable. Opening a row shows the reviews behind it, each with
the issues the model pulled out of it and how confident it was.

![Drill-down: the 29 reviews behind "Login & account access"](docs/issue-drilldown.png)

There is a longer visual writeup of the architecture — the reasoning behind each
stage, the dedup threshold, the schema — as an interactive page:
**[Review Signal Architecture](https://claude.ai/code/artifact/8feb4406-cebd-4928-9e86-91ee717a3132)**.

---

## Quick start

Requirements: **Node 22+**, **pnpm 10+**, **Docker** (for Postgres).

```bash
pnpm install                 # also builds the shared contracts package
cp .env.example .env
pnpm db:up                   # starts Postgres on :5433 and waits for it
pnpm db:push                 # creates the tables
pnpm seed                    # loads the reviews and replays the committed run
pnpm dev                     # API on :3001, UI on http://localhost:5173
```

`pnpm seed` needs **no API key**. It runs the real pipeline — ingest, junk
filter, dedup — and replays the model's extraction from the committed
`data/snapshot.json`, which is a genuine `claude-opus-5` run over all 300
reviews. The UI is fully populated in about a minute.

Or in one line: `pnpm setup && pnpm dev`.

---

## Running the pipeline for real

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env
pnpm pipeline:run            # re-extracts everything through Claude
pnpm pipeline:snapshot       # freezes the result into data/snapshot.json
```

A full run takes about 100 seconds and costs roughly $1 on `claude-opus-5`.
Re-runs are idempotent: a review whose text and prompt version are unchanged is
never sent to the model twice. `pnpm pipeline:run --force` overrides that.
Without an API key the command falls back to a deterministic keyword mock so the
pipeline is still runnable end to end.

The run prints what it did:

```
  ingested           300
  junk removed       9
  spam removed       3
  duplicates merged  15 across 12 clusters
  analysed           276
  counted in report  273
  tokens             22972 in (41846 cached) / 38576 out
  estimated cost     $1.0793
```

---

## Running the eval

```bash
pnpm eval
```

Scores the system against **20 hand-labelled reviews** in
`data/gold-labels.json` and writes `eval-report.json`. It reports spam/junk
detection, duplicate detection, sentiment accuracy, severity (exact and within
one level), language detection, and micro precision/recall/F1 over issue
categories — then lists every review it disagreed with, so the failures are
readable rather than just a number.

The sample is stratified, not random: 2 spam, 2 contentless, 3 non-English, 2
duplicate-cluster members, 4 multi-issue, 3 where the star rating contradicts
the text, 4 ordinary. A random 20-of-300 would have been almost entirely
ordinary English single-issue reviews and would have measured nothing.

On the committed snapshot it reports 100% on spam/junk detection, duplicate
detection, sentiment, language and issue categories, and 93.8% exact on severity
(100% within one level) — one disagreement, discussed in `WRITEUP.md`. Sixteen
scored reviews is enough to catch a broken system, not to certify a good one;
the failure list matters more than the percentages.

Unit tests for the deterministic stages:

```bash
pnpm test        # 26 tests: normalisation, junk rules, similarity, clustering
```

---

## All commands

| Command | What it does |
|---|---|
| `pnpm setup` | install + database + schema + seed, in one go |
| `pnpm dev` | API and UI together |
| `pnpm build` / `pnpm typecheck` / `pnpm test` | across the whole workspace |
| `pnpm db:up` / `pnpm db:down` | start / stop Postgres |
| `pnpm db:push` | apply the Drizzle schema |
| `pnpm db:reset` | truncate every pipeline table |
| `pnpm seed` | load reviews and replay the committed snapshot |
| `pnpm pipeline:run [--force] [--mock]` | run the pipeline (uses the API key if present) |
| `pnpm pipeline:snapshot` | write the current extraction to `data/snapshot.json` |
| `pnpm eval` | score the system against the hand-labelled set |

---

## Layout

```
apps/api        NestJS — the pipeline, the REST API, and the CLI entry points
apps/web        React 19 + Vite + TanStack Query + shadcn/ui, feature-sliced
packages/contracts  Zod schemas shared by both: taxonomy, severity rubric, DTOs
data/           reviews.json, gold-labels.json, snapshot.json
```

The UI follows feature-sliced design (`app` / `pages` / `widgets` / `features` /
`entities` / `shared`). shadcn/ui components live in `apps/web/src/shared/ui` —
they are source in this repo, not a dependency, so they are edited directly.
`components.json` is configured to that path, so `pnpm dlx shadcn@latest add
<component>` lands in the right place.

The pipeline runs in six stages, and only one of them calls a model:

![Six pipeline stages: 300 rows in, 291 after the junk filter, 276 after dedup, 273 after the model flags spam](docs/pipeline.png)

The running count is the point. Doing the cheap deterministic work first means
that by the time the model is called, 24 rows have already been removed for
free — and every one of those removals is a deterministic function a unit test
can pin down. See `WRITEUP.md` for why each stage works the way it does.

---

## API

| Endpoint | Returns |
|---|---|
| `GET /api/issues?product=&severity=&source=&includePositive=` | ranked top issues |
| `GET /api/issues/:category/reviews?...` | the reviews behind one issue |
| `GET /api/reviews/:id` | one review with its analysis and cross-posts |
| `GET /api/stats` | corpus totals, what was excluded, last run |
| `GET /api/excluded` | every removed review, with the reason |
| `GET /api/products` | product list |

---

## Configuration

Everything in `.env` (see `.env.example`); all of it has working defaults except
the API key.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5433/review_signal` | port 5433 avoids clashing with a local Postgres |
| `ANTHROPIC_API_KEY` | *(empty)* | only needed to run the pipeline for real |
| `LLM_MODEL` | `claude-opus-5` | |
| `LLM_EFFORT` | `medium` | |
| `LLM_BATCH_SIZE` | `20` | reviews per structured-output call |
| `LLM_CONCURRENCY` | `4` | batches in flight |
| `DEDUP_THRESHOLD` | `0.88` | trigram similarity; see `WRITEUP.md` |
