# Known limitations

Honest list of gaps, with where they are tracked.

## Blocked on external input (not code gaps)

1. **Real Apify smoke test not yet run** — needs the user's token and explicit
   approval. Until then the Apify integration is contract-tested against the
   actor's published schema but not live-verified. (memory.md blockers)
2. **Live auth flow not yet exercised** — needs a hosted Supabase project;
   fixture E2E runs on PGlite prove the pipeline, RLS, and data layer.
3. **Apollo disabled** by design pending commercial approval.

## Functional gaps (deliberate v1 scope)

- **One location per run** — the schema accepts up to 20 locations; the actor
  takes one per run. Multi-location fan-out (N runs per search with split
  caps) is a follow-up.
- **Post-run enrichment** — decision-makers are enriched inline during the
  search run. "Enrich these selected existing companies" (enrichment_requests
  tables are ready) has no UI/worker path yet.
- **Duplicate review queue UI** — weak matches land in `duplicate_candidates`
  but the review/merge/undo screens are not built; merges currently happen
  only via deterministic auto-keys. merge_events supports undo when built.
- **Destinations** (Google Sheets, webhooks, n8n/Make/Zapier) —
  schema + flags exist, adapters not implemented; UI shows honest "not
  available".
- **Saved views, column visibility, tags/notes UI, custom fields UI** —
  tables exist; Companies/Contacts v1 ships search + status filter + bulk
  add-to-list instead.
- **Super-admin console** — `is_super_admin`, flags, approvals, and
  security_events exist server-side; the dedicated console UI is not built.
- **Invitation emails** — no SMTP; invite links are shown once to the inviter.
- **Notifications are in-app only**; no email digests.

## Technical debt (tracked in RELEASE_CHECKLIST)

- In-memory rate limiter (per-instance) → Postgres/KV before multi-instance.
- Export files on local disk in dev → private object storage before real
  personal-data exports.
- `rootDomain` uses a pragmatic multi-part TLD list, not the full public
  suffix list — rare exotic TLDs may dedupe conservatively (never merges more
  aggressively, only less).
- Phone E.164 conversion covers ~130 dial codes; unknown-country numbers keep
  digits with `e164 = null` (never guessed).
- Playwright browser suite not yet added; manual E2E checklist in TEST_PLAN.md.
- Worker runs via tsx (no build step); acceptable at this scale, compile step
  optional later.
