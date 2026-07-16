# Test plan

## Automated (all green: 133 tests across 10 files)

| Suite                       | File(s)                                        | Covers                                                                                                        |
| --------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Cost estimator (12)         | packages/core/test/estimator.test.ts           | Master-prompt $13 reference case, low≤expected≤high, cap headroom/validation vs budget & per-run limits         |
| State machine (7)           | packages/core/test/state-machine.test.ts       | Happy path, illegal transitions, terminal states, cancellation, retry                                           |
| Normalizers (20)            | packages/core/test/normalize.test.ts           | URL canon, root domain (multi-part TLDs), email, E.164 (never fabricates country), names, LinkedIn classify     |
| Dedupe (13)                 | packages/core/test/dedupe.test.ts              | Priority keys, auto vs review, cross-provider matching, merge policy (verified/human-edited protection)         |
| CSV safety (7)              | packages/core/test/csv.test.ts                 | Formula-injection escaping (incl. whitespace-prefixed), quoting, BOM/CRLF                                        |
| Security (16)               | packages/security/test/security.test.ts        | Envelope crypto round-trip/tamper/wrong-key, signed token expiry/purpose/tamper, redaction (keys, JWTs, URLs)   |
| DB + RLS (24)               | packages/db/test/rls.test.ts                   | Real migrations on PGlite; cross-tenant read/write/IDOR denial, role boundaries, secret/queue invisibility, append-only audit, uniqueness/idempotency constraints, seeds |
| Provider contract (17)      | packages/providers/test/apify-contract.test.ts | Verified request mapping, cap enforcement, header-only auth, response mapping, null preservation, malformed rejection, email-status truthfulness, run-status mapping, pagination |
| Provider gates (7)          | packages/providers/test/gates.test.ts          | Apollo commercial gate, honest stub manifests, registry refusal                                                  |
| Pipeline E2E (10)           | apps/worker/test/pipeline.test.ts              | Full fixture run on real Postgres: queue → start → poll → paginated ingest → normalize → dedupe → contacts (LinkedIn separation, email statuses) → reconcile → completed; counts, provenance, idempotent ledger, audit trail, fixture flagging |

Quality gates also include `npm run typecheck` (0 errors), `npm run lint`
(0 errors), `prettier --check`, and the production build.

## Manual — fixture E2E checklist

Sign up → verify → onboarding (org + budget + acknowledgement) → connect check
(fixture pre-connected) → Lead Finder → estimate panel updates live → confirm
cap → run page auto-refreshes through stages → Companies (9, dedupe verified)
→ company detail (provenance, contacts) → Decision Makers (verified/catch-all/
unavailable/invalid states visible) → add to list → export CSV + XLSX →
download via expiring link → Usage (ledger + reconciliation row) → Audit trail
events present → second user in another org sees none of it.

## Real provider smoke test (pending — requires user token + approval)

1. Connect Apify in Integrations (test must pass).
2. Search: “coffee shop”, one city, `maxResults=10`, no enrichment first run;
   cap ≤ $0.30. Confirm.
3. Verify: dataset pagination, field mapping against live schema, counts,
   reconciliation `actual_cost` > 0 and ≤ cap, ledger idempotency.
4. Optional second run with `decisionMakers.enabled`, 1 contact/company,
   verification on; cap ≤ $0.50. Verify returned/missing lead fields land
   with truthful statuses.
5. Record results in memory.md; only then flip the “production-ready” claim.

## Known gaps

- No browser-automation suite yet (Playwright) — manual checklist covers it.
- Responsive/a11y review at the 9 spec breakpoints is a RELEASE_CHECKLIST item
  to re-verify against a live Supabase-backed instance.
