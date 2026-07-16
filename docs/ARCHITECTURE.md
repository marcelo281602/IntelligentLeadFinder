# Architecture

## System shape

```
Browser ── Next.js 15 (apps/web, Vercel-compatible)
              │  Server Components (reads, RLS-scoped)
              │  Server Actions (mutations: auth→membership→permission→zod→rate limit→audit)
              ▼
        Supabase (hosted): Postgres + Auth (cookie sessions via @supabase/ssr)
              ▲
              │  service-role Postgres connection (DATABASE_URL)
        Worker (apps/worker, long-lived Node process)
              │  provider adapters (packages/providers)
              ▼
        Apify API (BYO key)  /  Fixture provider (deterministic, free)
```

- **Two data paths.** User-facing reads/writes use the user's JWT → RLS applies
  (defense in depth on top of explicit org filters). The worker and a small set
  of privileged server operations (secret storage, job enqueue, audit writes,
  state transitions) use the service role and always filter by
  `organization_id` explicitly.
- **Durable jobs.** `provider_jobs` is a Postgres-backed queue claimed with
  `FOR UPDATE SKIP LOCKED`. Jobs carry `idempotency_key` (unique), attempts,
  backoff-with-jitter retries, heartbeats, and a dead-letter status. Stalled
  jobs (dead worker) are recovered by heartbeat age. The design is portable —
  swapping in Trigger.dev/Inngest later only replaces `queue.ts`.

## Run pipeline (state machine in packages/core/src/state-machine.ts)

```
draft → estimating → awaiting_confirmation → queued → starting → running
  → ingesting → normalizing → deduplicating → (enriching) → export_ready
  → completed | partially_completed          (+ cancellation_requested → cancelled, failed → queued)
```

Job kinds: `run_search` (start provider run; duplicate-start-safe because the
provider run id is persisted before anything else can fail) → `ingest_dataset`
(poll authoritative provider state, page dataset, checkpointed offset) →
`normalize_run` (map → post-filter → suppress → dedupe → contacts; checkpointed
by `provider_raw_records.ordinal`) → `reconcile_costs` (provider-reported
usage → cost_ledger + idempotent usage_events → final state + notification).
`generate_export` and `retention_sweep` run on the same queue.

## Determinism & idempotency guarantees

- Raw records: unique `(run_id, payload_hash)`; ordered processing by `ordinal`.
- Dedupe: priority-1..3 keys (place id, root domain, E.164 phone) auto-merge via
  the `company_dedupe_keys` unique index; priority-4..5 only create
  `duplicate_candidates` for human review. Merges never overwrite verified or
  human-edited values.
- Ledger: `usage_events.idempotency_key` unique; `cost_ledger` one row per run.
- Worker restart mid-run resumes from `search_runs.checkpoint`.

## Frontend

App Router, Server Components by default; client components only where
interaction demands (search builder with live estimate, nav active state,
poller). The live estimate in the browser uses the same
`packages/core` estimator the server re-runs authoritatively at draft time —
one formula, two call sites, zero drift.

## Boundaries

- `packages/core` has no I/O. `packages/providers` speaks fetch + zod only.
- Provider response shapes never leak past `MapsProviderAdapter.mapItem` —
  the DB schema is provider-independent, so Outscraper/Yelp adapters can be
  added without touching ingestion, dedupe, UI, or exports.
