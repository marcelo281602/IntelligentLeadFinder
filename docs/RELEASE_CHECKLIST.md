# Release checklist

## Every release

- [ ] CI green on the release commit (typecheck, lint, all 133+ tests, build,
      audit, secret scan)
- [ ] New migrations applied to staging and verified
- [ ] Fixture E2E checklist passed on staging (docs/TEST_PLAN.md)
- [ ] memory.md updated with any new decisions
- [ ] Rollback point noted (previous Vercel deployment id + worker commit)

## Provider-touching releases (additional)

- [ ] Apify smoke test (≤10 records, low cap) re-run on staging — approved by
      the platform owner beforehand
- [ ] Rate cards re-verified against public pricing pages; new versions
      published if prices moved

## First production launch (one-time gates)

- [ ] Production Supabase project on a plan with PITR; backups verified by a
      test restore
- [ ] Fresh `APP_ENCRYPTION_KEY` / `APP_SIGNING_SECRET` (not staging values)
- [ ] Export storage moved from local disk to a private object-storage bucket
- [ ] Rate limiting moved from in-memory to Postgres/KV (multi-instance safe)
- [ ] MFA enforced for super-admin / owner accounts (Supabase Auth config)
- [ ] Error tracking + alerting wired (health checks, dead-letter count,
      queue depth, budget-warning events)
- [ ] Legal review completed: Google Maps / Apify / enrichment terms for the
      target countries; acceptable-use policy and privacy policy published
- [ ] Apollo remains OFF unless `commercial_use_approvals` documents approval
- [ ] Responsive pass at 320/375/390/430/768/1024/1280/1440/1920 px and
      keyboard/contrast a11y pass on the live instance
- [ ] Post-deploy smoke executed and recorded (docs/DEPLOYMENT.md §6)

No release ships with a known critical/high security finding.
