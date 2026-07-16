# Operations runbook

## Daily signals

| Signal              | Where                                                                  | Healthy                         |
| ------------------- | ----------------------------------------------------------------------- | -------------------------------- |
| Web/db health       | `GET /api/health`                                                       | 200 `healthy`                    |
| Queue depth         | `select status, count(*) from provider_jobs group by 1`                 | pending near 0 between runs      |
| Dead letters        | `select * from provider_jobs where status='dead_letter'`                | empty                            |
| Stalled runs        | `select id,status,last_heartbeat_at from search_runs where status not in ('completed','cancelled','failed','partially_completed','draft','awaiting_confirmation') and last_heartbeat_at < now()-interval '10 minutes'` | empty |
| Estimate variance   | `select avg(variance_micro_usd) from cost_ledger where reconciled_at > now()-interval '7 days'` | small; investigate big positives |
| Webhook backlog     | `select count(*) from provider_webhook_inbox where processed_at is null` | transient only                   |

Worker logs are structured JSON with org/run/job correlation ids and
redaction applied — safe to ship to any log sink.

## Common procedures

**Run stuck in `running`/`ingesting`** — check worker logs for the run id;
check the stalled-jobs recovery fired (`Recovered N stalled job(s)`); if the
provider run died without a webhook, the poller re-checks on its own — verify
the pending `ingest_dataset` job's `run_after`. Manual nudge:
`update provider_jobs set run_after=now() where run_id='...' and status='pending'`.

**Dead-lettered job** — read `last_error` (redacted). Fix cause (usually a
revoked provider token → rotate in UI). Requeue:
`update provider_jobs set status='pending', attempts=0 where id='...'`.
The run was flagged `failed`; the user can hit Retry / resume.

**Provider rate limits** — adapter marks 429s retryable; backoff handles it.
Sustained 429s: lower `WORKER_CONCURRENCY`.

**User reports missing enrichment fields** — expected behavior when the
provider returned null; verify on the contact page that the status reads
`unavailable`/`not_requested` rather than an error. Never backfill manually.

**Retention sweep verification** — hourly job; confirm
`select count(*) from provider_raw_records where retention_until < now()` is 0
and expired exports are `purged`.

**Publishing new provider prices** — insert a new `provider_rate_cards` row
with `version = max+1` and current `last_verified_at`; never mutate old
versions. New estimates pick the highest active version automatically.

## Scheduled

- Weekly: review audit log for anomalies (`action like 'integration%'`,
  `org.limits_changed`), dependency audit output in CI, Supabase backup status.
- Monthly: restore-test the database backup into a scratch project;
  re-verify provider prices against public pages and publish new card
  versions if changed.
