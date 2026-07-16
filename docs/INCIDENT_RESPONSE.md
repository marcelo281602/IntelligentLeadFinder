# Incident response

## Severity

- **SEV1** — cross-tenant data exposure, credential/master-key leak, runaway
  provider spend, data loss. All-hands, immediate containment.
- **SEV2** — pipeline down (runs not progressing), auth outage, export
  downloads broken.
- **SEV3** — degraded single feature, elevated error rate, one tenant affected.

## Process

1. **Declare & log** — open an incident note (time, reporter, symptoms, SEV).
2. **Contain** using the kill switches:
   - Stop paid activity: global `provider_apify` feature flag → false.
   - Stop all processing: scale worker to zero (queue persists).
   - Suspected secret leak: rotate per docs/ROLLBACK.md §Credential compromise.
   - Suspected tenant-isolation bug: take the web app offline (Vercel pause)
     before investigating — never debug live with a possible cross-tenant leak.
3. **Diagnose** — worker JSON logs (correlation ids), `security_events`,
   `audit_logs`, queue/table checks in OPERATIONS_RUNBOOK.md.
4. **Recover** — rollback (web/worker) or roll-forward migration; requeue
   dead letters; verify with the fixture E2E.
5. **Communicate** — affected orgs get in-app notifications; SEV1 personal-data
   incidents additionally follow the operator's legal notification obligations
   (jurisdiction-dependent; involve counsel).
6. **Post-mortem** within 5 working days: timeline, root cause, action items;
   add regression tests; update memory.md and this playbook.

## Specific playbooks

**Runaway spend** — flag off provider; abort in-flight runs from run pages;
reconcile actuals; compare `cost_ledger` totals with the provider dashboard;
verify caps were sent (`search_runs.hard_cap_micro_usd`) — if a run exceeded
its cap, that is a provider-side incident to raise with Apify support.

**Cross-tenant report** — treat as SEV1 until disproven. Reproduce with two
test orgs; check the RLS suite against the deployed migration set; inspect
recent policy changes in git; audit `audit_logs`/PostgREST logs for the window.

**Webhook flood** — endpoint rate-limits per IP and 404s unknown tokens;
if sustained, block source IPs at the edge (Vercel WAF) — processing is
unaffected because polling is authoritative.
