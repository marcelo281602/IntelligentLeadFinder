# Provider adapters

All provider I/O goes through `MapsProviderAdapter`
(`packages/providers/src/types.ts`):

```
capabilities() · testConnection() · startRun() · getRunStatus()
abortRun() · fetchDatasetPage() · mapItem(raw, context)
```

`startRun` refuses to run without a positive `hardCapMicroUsd`. `mapItem`
returns a provider-independent `MappedCompany` (+ embedded `MappedContact[]`)
or `null` for invalid items — it never guesses.

## Status

| Provider   | Status                    | Notes                                                                                     |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| Apify      | Implemented, contract-tested | Google Maps actor + Business Leads enrichment. Needs a real ≤10-record smoke test before being called production-ready. |
| Fixture    | Implemented               | Deterministic, free, full pipeline coverage; rows flagged `is_fixture`.                    |
| Outscraper | Stub (capability manifest) | Planned lower-cost base source. Feature flag `provider_outscraper` off.                    |
| Prospeo    | Stub (capability manifest) | Planned email find/verify. Flag `provider_prospeo` off. Capabilities publish per-account after connection testing. |
| Apollo     | Stub + hard commercial gate | `assertApolloAllowed` requires a `commercial_use_approvals` row AND the feature flag. BYO-key does not remove Apollo's restriction against powering external products. |
| Yelp       | Roadmap                   | Approved future adapter via an Apify Yelp actor; same normalized schema, feature-flagged. |
| LinkedIn scraping | **Never**          | Prohibited by the master prompt; LinkedIn URLs come only from licensed Business Leads data or manual entry. |

## Adding a new Maps source

1. Create `packages/providers/src/<name>/{schemas,client,adapter}.ts`; validate
   every response with zod `.passthrough()` schemas of the documented subset.
2. Map into `MappedCompany` — never add provider-shaped columns to the DB.
3. Add contract tests (request mapping, response mapping, nulls, pagination,
   run status mapping, cap enforcement) using redacted fixtures.
4. Register in `getMapsAdapter`, seed a `provider_rate_cards` row, add the
   feature flag, and surface an integration card.
5. Keep it flagged off until a real low-cost smoke test passes.

## Capability manifests

Unimplemented or gated providers still publish an honest `CapabilityManifest`
so the UI shows "not available" with reasons instead of dead buttons.
