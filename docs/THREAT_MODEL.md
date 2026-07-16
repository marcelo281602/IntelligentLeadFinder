# Threat model

Method: STRIDE over the four trust boundaries — browser↔web, web/worker↔DB,
platform↔provider APIs, provider→webhook.

## Assets

Provider credentials (highest value), collected personal data (decision-maker
contacts), tenant business data, cost-control integrity (money), audit-trail
integrity, platform availability.

## Actors

Anonymous internet, authenticated user of another tenant (primary adversary in
multi-tenant SaaS), low-privileged member of the same tenant, compromised
provider/webhook sender, compromised dependency, curious operator.

## Key threats & mitigations

| Threat                                                        | Mitigation                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Cross-tenant read/write (IDOR, forged org id)                 | RLS on every tenant table + membership-derived org context + explicit filters; tested (rls.test.ts)                 |
| Secret theft via API/UI/logs                                  | Deny-all secret table, envelope encryption, fingerprint-only display, redaction in every log path                   |
| Secret theft via DB snapshot                                  | Ciphertext only; master key lives in the runtime env, not the DB                                                     |
| Runaway spend (bug, malice, retry storm)                      | Server-validated hard cap → provider-enforced `maxTotalChargeUsd`; monthly budget block; idempotent ledger; duplicate-start protection (persisted provider run id + unique job key) |
| Privilege escalation within a tenant                          | Server-side permission matrix + RLS role checks; members cannot alter own membership row role (tested)               |
| Webhook forgery / replay / poisoning                          | Hash-matched high-entropy token, dedupe-key inbox, body cap, rate limit, and authoritative re-fetch from provider API — webhook content is never trusted for state |
| Spreadsheet formula injection via scraped business names      | `escapeFormulaInjection` on all CSV cells/headers and XLSX string cells (tested)                                     |
| Export link leakage                                            | 15-min purpose-bound HMAC tokens; 24 h export expiry; 7-day purge; downloads audited                                 |
| Malicious provider payloads (XSS/oversize/shape attacks)      | zod validation, React auto-escaping (no dangerouslySetInnerHTML), payload redaction, size-bounded pages             |
| State-machine corruption (double confirm, skipped confirm)     | Guarded compare-and-swap transitions + `assertTransition`; client can only ever insert `draft` runs                  |
| Session theft                                                  | HttpOnly SameSite cookies, session refresh in middleware, strict CSP reducing XSS surface                            |
| Dependency compromise                                          | Exact-pinned versions, committed lockfile, CI audit + secret scan; see SECURITY.md                                   |

## Accepted risks (documented)

1. **In-memory rate limiter** is per-instance; multi-instance deployments need
   the Postgres/KV variant before launch (RELEASE_CHECKLIST item).
2. **Apify ad-hoc webhooks are unsigned** by the provider; compensated by
   token + re-fetch design, residual risk is spam to a 404ing endpoint.
3. **MFA for privileged accounts** relies on Supabase Auth configuration and
   is a launch-gate item, not enforced in code yet.
4. **Local-disk export storage in dev**; production must use private object
   storage before real personal data is exported.

## Non-goals

No outreach/sending features (no CAN-SPAM/TCPA surface yet); no direct
LinkedIn or Google scraping by this codebase (delegated to contracted
providers under their terms).
