# Master Prompt: Lead Finder and Decision-Maker Intelligence SaaS Platform

## Role

Act as a senior **Claude Code SaaS Platform Architect**, **Full-Stack AI Product Builder**, **AI Automation Engineer**, **Data Platform Engineer**, **DevOps Engineer**, **Security Architect**, **Privacy Engineer**, and **Product Execution Lead**.

You are not only advising me.

You are responsible for **inspecting, architecting, building, integrating, debugging, testing, securing, documenting, and preparing this SaaS platform all the way from localhost to production**.

Do not stop at mockups, disconnected screens, placeholder buttons, or recommendations.

Build a real, working SaaS product.

---

## Project Name

**LeadFinder SaaS Platform**

This is a working product name.

All user-facing branding must be controlled through one centralized brand configuration so the name, logo, colors, metadata, email sender identity, and support links can be changed later without searching the entire codebase.

Do not copy the “Ninjas Lead Finder” name, logo, or visual identity from the reference image.

---

## Confirmed Build Assumptions

Unless the repository or the user provides different instructions, use these defaults:

- New production-ready codebase
- Multi-tenant SaaS
- Bring-your-own-key provider model for the first production release
- Each organization securely connects its own Apify, Apollo, Outscraper, Prospeo, or future provider credentials
- Initial production capacity target of approximately 10,000 collected business records per month
- Global country and location support
- Apify as the primary Google Maps data provider
- Apify Business Leads enrichment as the first decision-maker option
- Apollo as an optional fallback only after commercial-use rights are confirmed
- Outscraper as an optional lower-cost Google Maps source
- Prospeo as an optional contact enrichment or verification provider
- Responsive desktop-first dashboard with complete mobile usability
- Vercel-compatible web application
- Supabase/Postgres database and authentication
- A durable background-job system for long-running provider operations
- GitHub-ready repository and CI/CD

These assumptions must be written into the architecture decision log.

Do not block the build on the final brand name. Use the centralized working brand configuration.

---

## Main Goal

Build a secure, production-ready lead intelligence SaaS platform that allows an authorized user to:

1. Enter an industry, business type, or search term.
2. Select a country and optionally narrow the search by state, region, city, postal code, or radius.
3. Set result, quality, and business filters.
4. Preview the estimated provider cost before running the search.
5. Start an asynchronous Google Maps business-data collection job.
6. Track progress, failures, partial completion, cost, and result counts.
7. Review normalized and deduplicated company records.
8. Optionally find relevant decision-makers.
9. Optionally reveal or verify work email addresses and phone numbers.
10. Store personal and company LinkedIn profile URLs when a permitted provider returns them.
11. Organize records into lists with tags, notes, owners, and statuses.
12. Export selected data to CSV or XLSX.
13. Send selected data to approved destinations such as Google Sheets, a webhook, n8n, Make, Zapier, or a CRM adapter.
14. Track provider usage and cost by organization, user, run, provider, and feature.
15. Maintain complete audit, security, and data-provenance records.

The system must work end to end in local development, staging, and production.

---

## Core Product Vision

The primary workflow is:

    Search setup
        → Cost estimate
        → User confirmation
        → Queued provider job
        → Google Maps company data
        → Normalization
        → Deduplication
        → Optional company-contact discovery
        → Optional decision-maker discovery
        → Optional email and phone enrichment
        → Review
        → List
        → Export or destination sync
        → Usage and audit reconciliation

The experience should feel simple to a non-technical user, while the implementation remains modular, observable, secure, and provider-independent.

---

## Product Truthfulness Rules

Never make the UI promise data that the provider did not return.

The application must distinguish between:

- Company phone number
- Decision-maker phone number
- General company email
- Decision-maker work email
- Personal email, if a provider legally returns one
- Company LinkedIn URL
- Decision-maker LinkedIn profile URL
- Found
- Verified
- Unverified
- Catch-all
- Inferred
- Unavailable
- Provider error
- Not requested

Never label a general company email as a decision-maker email.

Never label an inferred email as verified.

Never invent a decision-maker, title, email, phone number, company URL, or LinkedIn URL.

Every externally sourced field must retain source, source record identifier, retrieval time, confidence or verification state, and permitted-use metadata.

If a field is missing, show a clear null state or reason. Do not silently fill it with fabricated data.

---

## Reference Image Interpretation

Use the attached reference image only as inspiration for a simple three-step user journey:

- Search
- Extract
- Export

Improve it into:

- Search
- Enrich
- Review
- Export

Do not place provider API tokens inside the Lead Finder search form.

Provider credentials belong only in **Settings → Integrations** and must never be stored in localStorage, sessionStorage, browser-readable cookies, frontend state persistence, URL parameters, analytics payloads, or client-side source code.

The search screen must show connection status, such as “Apify connected,” without revealing the secret.

---

## Non-Negotiable Product Principles

- Build a real multi-tenant SaaS, not a single-user script.
- Keep provider integrations behind typed adapter interfaces.
- Never couple the database schema directly to one provider’s response shape.
- Treat all provider responses and webhooks as untrusted input.
- Run long operations asynchronously.
- Make every job resumable and idempotent.
- Add cost caps before paid jobs start.
- Reconcile estimated cost with provider-reported actual cost.
- Enforce organization isolation in both application code and database policies.
- Use secure server-side secret handling.
- Add audit logging from the beginning.
- Maintain raw-source provenance without exposing raw secrets.
- Provide usable partial results when a provider partially succeeds.
- Use feature flags for unfinished, legally gated, or commercially restricted integrations.
- Do not expose unavailable features as if they work.
- Do not perform automatic outreach in the first release.
- Do not send messages, emails, CRM writes, or production exports without an explicit user action and confirmation.

---

## Recommended Production Architecture

### Repository

Prefer a TypeScript monorepo with clear boundaries:

- apps/web — Next.js SaaS dashboard and authenticated API layer
- apps/worker — durable background jobs and provider orchestration
- packages/core — domain models, policies, validation, and state machines
- packages/db — schema, migrations, queries, RLS tests, and seed data
- packages/providers — provider adapter interfaces and implementations
- packages/security — encryption, redaction, signatures, authorization helpers
- packages/ui — reusable accessible UI components
- packages/config — typed environment and brand configuration
- packages/testing — fixtures, provider contract tests, and test utilities

If an existing repository is provided, inspect it first and adapt this architecture without unnecessarily rebuilding working code.

### Frontend

- Current stable Next.js App Router or equivalent production React framework
- TypeScript strict mode
- Tailwind CSS
- Accessible component system
- Server Components where appropriate
- Client Components only where interaction requires them
- Typed forms and schemas
- Responsive design
- Error boundaries
- Loading, empty, partial, and failure states

Do not blindly upgrade framework versions. Inspect compatibility, pin versions, and commit the lockfile.

### Backend

- Server-only service layer
- Typed API contracts
- Zod or equivalent validation at every trust boundary
- Background-job orchestration for search, ingestion, enrichment, export, and destination sync
- Idempotency keys for every billable or repeatable action
- Retry policies with exponential backoff and jitter
- Dead-letter handling
- Cancellation support
- Provider rate-limit handling
- Webhook inbox pattern

### Database

- Supabase/Postgres
- SQL migrations committed to source control
- Row-Level Security for all organization-owned tables
- Foreign keys and check constraints
- Unique indexes for provider identifiers and deduplication
- Transactional writes for state changes
- Soft deletion where recovery is useful
- Explicit retention jobs
- Database backup and restore procedure

### Authentication

- Supabase Auth or an equally secure production auth provider
- Email and password
- Password reset
- Email verification
- OAuth-ready structure
- Optional magic link
- Multi-factor authentication for super-admin and privileged production access
- Secure, HttpOnly, SameSite cookies
- Session rotation and revocation

### Deployment

- Vercel for the web application when suitable
- Supabase for Postgres and Auth
- A durable worker platform for jobs that should not depend on short request lifetimes
- Separate staging and production environments
- GitHub Actions for validation
- Preview deployments without production secrets
- Health, readiness, and dependency checks

The worker platform may use Trigger.dev, Inngest, a Postgres-backed queue, or a dedicated Node worker. Select one after checking the repository and deployment constraints. Keep job definitions portable enough that the application is not trapped in one queue vendor.

### Observability

- Structured logs
- Correlation IDs
- Organization ID and run ID context
- Secret and PII redaction
- Error tracking
- Job metrics
- Provider latency, success, failure, and rate-limit metrics
- Cost-estimate variance
- Queue depth
- Dead-letter count
- Database and API health
- Alerting for critical failures

---

# Primary SaaS Modules

---

## Module 1: Authentication, Organizations, and Team Management

Build:

- Sign up
- Sign in
- Sign out
- Email verification
- Password reset
- Session management
- Organization creation
- Organization switching
- Invitations
- Team members
- Role assignment
- Member removal
- User profile
- Security settings
- Activity history

### Roles

- Super Admin
- Organization Owner
- Organization Admin
- Researcher
- Operations Member
- Viewer

### Required Permission Boundaries

**Super Admin**

- Manage platform-wide health and feature flags
- View sanitized operational metadata
- Impersonation is disabled by default
- If support impersonation is later added, require explicit reason, short expiry, visible banner, re-authentication, and immutable audit logs

**Organization Owner**

- Manage workspace
- Manage billing or entitlements when later enabled
- Manage provider connections
- Manage members and roles
- Delete or export organization data

**Organization Admin**

- Manage searches, results, integrations, and exports
- Invite permitted roles
- Cannot transfer ownership

**Researcher**

- Create and run searches within quota
- Review and enrich records
- Create lists
- Export only if granted

**Operations Member**

- Manage lists, tags, notes, and approved destination syncs
- Cannot manage provider secrets

**Viewer**

- Read permitted records
- Cannot run paid jobs, enrich, export, or change data

Every action must be authorized server-side. Hiding a button is not authorization.

---

## Module 2: Workspace Onboarding

Create a guided onboarding flow:

1. Create or join organization.
2. Choose default country, language, and currency.
3. Connect a Google Maps data provider.
4. Optionally connect a decision-maker or contact provider.
5. Test each connection.
6. Set default monthly and per-run cost limits.
7. Set data-retention preferences.
8. Review acceptable-use and data-compliance acknowledgement.
9. Run a low-cost test search.

The user can skip optional providers.

The application must remain usable for basic company collection when only Apify or Outscraper is connected.

---

## Module 3: Lead Finder Search Builder

Build a clean search form with progressive disclosure.

### Required Fields

- Search or campaign name
- Industry, business type, category, or search term
- Country
- Maximum result count

### Optional Location Fields

- State, province, or region
- City
- Postal or ZIP code
- Multiple locations
- Radius
- Radius unit
- Latitude and longitude for advanced mode
- Language

### Optional Business Filters

- Minimum rating
- Minimum review count
- Maximum review count
- Has website
- Has phone
- Has company email
- Exclude temporarily closed
- Exclude permanently closed
- Include or exclude specific categories
- Include or exclude keywords
- Exclude known chains
- Exclude existing workspace records
- One location per company or all locations

### Optional Decision-Maker Fields

- Enable decision-maker discovery
- Maximum contacts per company
- Target job titles
- Target seniority
- Target departments
- Strict title match or similar titles
- Require personal LinkedIn URL
- Request work email
- Verify work email
- Request mobile or direct phone
- Preferred enrichment provider
- Fallback provider

### Default Decision-Maker Titles

Provide editable presets:

- Owner
- Founder
- Co-Founder
- President
- Chief Executive Officer
- Managing Partner
- General Manager
- Director of Operations
- Operations Manager
- Marketing Director
- Head of Marketing
- Sales Director

Do not automatically request every title. Apply the user-selected title strategy and contact limit to control relevance and cost.

### Search Review Panel

Before the run starts, display:

- Provider
- Actor or data source
- Search terms
- Locations
- Maximum results
- Selected filters
- Enrichment settings
- Estimated company records
- Estimated decision-maker records
- Estimated low, expected, and high cost
- Assumed enrichment success rate
- Workspace monthly usage
- Remaining configured budget
- Hard maximum authorized cost
- Clear acknowledgement that actual available records may be lower

The user must confirm before a paid job starts.

---

## Module 4: Provider Cost Estimator and Hard Cost Controls

Create a provider-aware cost estimator.

Do not hardcode one static price as permanent truth.

Implement:

- Versioned provider rate cards
- Last-verified date
- Plan tier
- Currency
- Billing unit
- Minimum charge
- Estimated hit-rate assumptions
- Configurable markup field for a future platform-managed-credit model
- Admin-only update capability
- Historical rate retention so old run estimates remain explainable

### Apify Estimate Formula

For the maintained Google Maps actor, model selected event charges:

    Estimated cost =
        scraped places × scraped-place rate
        + scraped places × number of billable filters × filter rate
        + places receiving additional details × details rate
        + places receiving company-contact enrichment × company-contact rate
        + successfully extracted decision-maker leads × business-lead rate
        + decisive email verifications × verification rate
        + enriched social profiles × social-profile rate
        + requested reviews × review rate
        + requested images × image rate
        + any provider minimum or run-start charge

Show low, expected, and high estimates because successful enrichments and decisive verifications are not known in advance.

### Mandatory Run Caps

For Apify, send both:

- A result or paid-item cap where supported
- maxTotalChargeUsd on the Actor run

The run must never start without a server-calculated hard cost cap.

Users may lower the cap but may not raise it beyond their organization and plan entitlements.

### Actual Cost Reconciliation

After completion:

- Fetch authoritative provider usage after provider totals stabilize
- Store actual provider-reported cost
- Store charged-event counts
- Compare estimate to actual
- Explain variance
- Update usage ledger once through an idempotent transaction
- Never double-charge internal platform credits on a retry

---

## Module 5: Search Runs and Durable Job Orchestration

Use an explicit state machine:

- Draft
- Estimating
- Awaiting Confirmation
- Queued
- Starting
- Running
- Ingesting
- Normalizing
- Deduplicating
- Enriching
- Export Ready
- Completed
- Partially Completed
- Cancellation Requested
- Cancelled
- Failed

Each transition must validate its allowed previous state.

### Run Features

- Run detail page
- Live or periodically refreshed progress
- Provider run ID
- Dataset ID when applicable
- Start time
- Last heartbeat
- Completed time
- Current stage
- Counts discovered, ingested, accepted, duplicate, rejected, enriched, and failed
- Estimate and actual cost
- Error summary
- Redacted provider response metadata
- Retry failed stage
- Resume ingestion
- Cancel provider run when supported
- Duplicate-start protection

### Reliability Requirements

- Create the local run before calling the provider
- Use an idempotency key
- Persist provider identifiers immediately
- Accept duplicate webhook delivery safely
- Persist webhook inbox entries before processing
- Verify provider state using the provider API
- Page through datasets
- Save checkpoints
- Resume after worker restart
- Never re-enrich already completed records unless explicitly requested
- Mark partial success instead of discarding usable records

---

## Module 6: Apify Google Maps Integration

Use a typed Apify provider adapter.

Default Actor:

    compass/crawler-google-places

Keep the Actor identifier configurable because pricing, input schemas, or product choices may change.

### Apify Connection Settings

- API token
- Account or workspace label
- Actor identifier
- Apify plan tier
- Default maximum results
- Default per-run maximum cost
- Default contact-enrichment settings
- Connection status
- Last successful connection test
- Last provider error
- Credential rotation action

### Secret Rules

- Submit the token only to a server endpoint over HTTPS
- Encrypt it before persistence
- Store only a secret reference in the regular connection record
- Never return the token after creation
- Show only a neutral “Connected” state or non-sensitive fingerprint
- Require re-authentication for replacement or deletion
- Redact authorization headers and token query parameters from logs

### Apify Run Strategy

- Start Actor asynchronously
- Use a unique run idempotency key
- Use maxTotalChargeUsd
- Use an item cap where supported
- Configure completion and failure callbacks
- If callbacks are not cryptographically signed by the provider, use a high-entropy callback secret, verify the expected provider run ID and organization mapping, then fetch authoritative status from Apify before processing
- Reject replays and expired callback tokens
- Fall back to rate-limited polling when a callback is missing
- Fetch dataset items in pages
- Validate every page
- Persist raw-source records separately from normalized records

### Apify Company Mapping

Map available provider fields into the normalized model:

- Business name
- Subtitle
- Primary category
- Categories
- Address
- Neighborhood
- City
- State or region
- Postal code
- Country code
- Latitude
- Longitude
- Phone
- Normalized phone
- Website
- Root domain
- Google Maps URL
- Place ID
- FID or CID when returned
- Rating
- Review count
- Open or closed status
- Opening hours
- Price range
- Company emails
- Company social profiles
- Company LinkedIn URL
- Retrieval timestamp

Do not require optional fields to be present.

### Apify Business Leads Mapping

When the user explicitly enables Business Leads enrichment, accept available fields such as:

- Provider person ID
- First name
- Last name
- Full name
- Job title
- Headline
- Department
- Seniority
- Work email
- Mobile or direct phone
- Personal LinkedIn profile URL
- Person location
- Company name
- Company website
- Company size
- Company LinkedIn URL
- Provider confidence or quality metadata

The Actor may return null for email or phone. Preserve null accurately.

### Apify Enrichment Defaults

- Disabled by default until the user opts in
- Maximum one decision-maker per company for the first low-cost preset
- Email verification optional
- Review scraping disabled for lead-generation runs unless requested
- Image scraping disabled
- Social-profile detail enrichment disabled
- Competitor AI analysis disabled

These defaults prevent surprise charges.

---

## Module 7: Optional Apollo Integration

Build an Apollo adapter behind a feature flag.

### Important Commercial Restriction

Apollo’s public pricing terms state that standard public plans are for internal business use and may not be used to power external products, share Apollo data with customers, or resell Apollo data without a separate agreement.

Therefore:

- Do not enable Apollo for production multi-tenant SaaS use until the platform owner has written confirmation, a reseller agreement, partner approval, or custom commercial terms that permit the intended use.
- Bring-your-own-key does not automatically remove this contractual requirement.
- Add an admin-level entitlement flag named apollo_commercial_use_approved.
- Keep the integration unavailable to client workspaces until that flag and supporting review metadata are present.
- Record approval date, approver, agreement reference, permitted use, and review date.
- Do not store an agreement document in a public bucket.

### Apollo Search Behavior

When permitted:

- Use People API Search for decision-maker discovery
- Batch by normalized company domain where practical
- Apply user-selected job titles and seniorities
- People API Search does not return email or phone
- Use People Enrichment or Bulk People Enrichment only after user cost confirmation
- Bulk people enrichment supports limited batch sizes; obey current provider documentation
- Phone enrichment may complete asynchronously; correlate its callback safely
- Track credits separately for email and phone
- Never repeat enrichment on an already revealed field without explicit refresh

### Apollo Matching

- Prefer exact normalized company domain
- Then verified provider organization ID
- Avoid company-name-only matching when multiple candidates exist
- Record match confidence and reasons
- Require user review below the configured confidence threshold

---

## Module 8: Optional Outscraper Integration

Build an Outscraper Maps-source adapter.

Use it as:

- A pay-as-you-go alternative for base Google Maps business data
- A fallback when an organization does not want Apify
- A provider comparison option

Do not assume it returns a relevant personal decision-maker for every company.

Its adapter must expose only capabilities confirmed by its current API:

- Company collection
- Supported filters
- Website and company contact enrichment
- Supported output and task status
- Actual cost or usage metadata when available

Use the same normalized company schema so users can switch providers without changing the rest of the application.

---

## Module 9: Optional Prospeo Integration

Build a Prospeo adapter for supported contact operations.

Use it for capabilities confirmed by the current account and API, such as:

- Work email finding
- Email verification
- Contact lookup from known person and company information
- Phone lookup where available

Do not claim that Prospeo discovers the correct decision-maker from a company domain unless the current API endpoint and account entitlement actually support that workflow.

The adapter must publish a capability manifest after connection testing.

Disable unsupported UI controls automatically.

---

## Module 10: Normalized Company and Contact Records

### Company Record

Store:

- Internal company ID
- Organization ID
- Canonical name
- Normalized name
- Primary category
- Categories
- Description when permitted
- Website
- Root domain
- General email addresses
- Primary company phone
- Additional company phones
- Company LinkedIn URL
- Other social URLs
- Full address
- Street
- City
- State or region
- Postal code
- Country
- Country code
- Latitude and longitude
- Google place ID
- Google Maps URL
- Rating
- Review count
- Business status
- Source freshness
- Created time
- Updated time
- Deleted time

### Decision-Maker Contact Record

Store:

- Internal contact ID
- Organization ID
- Company ID
- First name
- Last name
- Full name
- Job title
- Normalized title
- Seniority
- Department
- Work email
- Email status
- Email source
- Email verified time
- Phone
- Phone type
- Phone source
- Personal LinkedIn URL
- Company LinkedIn URL
- Provider person ID
- Provider match confidence
- Last enriched time
- Created time
- Updated time
- Deleted time

### Provenance Records

For each source:

- Provider
- Provider connection ID
- Provider record ID
- Provider run ID
- Source URL where permitted
- Retrieved time
- Raw schema version
- Normalization version
- Field-level source mapping
- Permitted-use classification
- Retention deadline
- Hash of the redacted raw payload

Raw provider payloads must have a short, documented retention period and must not contain credentials.

---

## Module 11: Deduplication and Entity Resolution

Use deterministic matching first.

### Company Deduplication Priority

1. Exact provider place ID within the provider namespace
2. Exact normalized root domain
3. Exact normalized E.164 phone
4. Normalized company name plus full address
5. Normalized company name plus city, region, and postal code

Do not automatically merge weak matches.

Create a review queue for ambiguous matches.

### Contact Deduplication Priority

1. Exact provider person ID within provider namespace
2. Exact normalized personal LinkedIn URL
3. Exact normalized verified work email
4. Exact normalized phone
5. Name plus company plus title, only as a review candidate

### Merge Rules

- Preserve all source records
- Use field-level freshness and verification status
- Never overwrite a verified value with an unverified one
- Never overwrite a human correction without a visible conflict
- Log merges and unmerges
- Support undo for manual merges

---

## Module 12: Lead and Contact Review Experience

Create separate but connected views:

- Companies
- Decision Makers
- Search Runs
- Lists

### Company Table Columns

- Select
- Company name
- Category
- City and country
- Rating and reviews
- Website
- General email
- Company phone
- Company LinkedIn
- Decision-maker count
- Data completeness
- Source
- Last updated
- Tags
- Actions

### Contact Table Columns

- Select
- Name
- Title
- Seniority
- Company
- Work email
- Email status
- Phone
- Personal LinkedIn
- Source
- Confidence
- Last enriched
- Tags
- Actions

### Table Features

- Server-side pagination
- Sort
- Search
- Column filters
- Saved views
- Column visibility
- Bulk select across current page
- Explicit “select all matching” action
- Bulk add to list
- Bulk tag
- Bulk enrichment preview
- Bulk export preview
- No accidental expensive action from a single click

### Record Detail

Show:

- Normalized fields
- Source and freshness
- Verification state
- Search-run history
- Enrichment history
- List membership
- Notes
- Tags
- Export and sync history
- Duplicate or merge history
- Audit history appropriate to the viewer’s role

---

## Module 13: Lists, Tags, Notes, and Assignment

Build:

- Static lists
- Saved smart filters
- Tags
- Notes
- Record owner
- Lead status
- Qualification status
- Custom fields with safe types
- Bulk actions

Suggested statuses:

- New
- Reviewing
- Qualified
- Not a Fit
- Contacted Externally
- Suppressed
- Archived

Do not build email sending into this module.

---

## Module 14: Exports

Support:

- CSV
- XLSX

### Export Builder

- Select companies, contacts, or combined rows
- Choose columns
- Rename export columns
- Choose whether to include source metadata
- Choose verified-only fields
- Preview row count
- Preview estimated generation time
- Show warning for personal data
- Require explicit confirmation

### Export Security

- Generate in a background job
- Authorize selection server-side
- Enforce export permission
- Protect against spreadsheet formula injection by escaping dangerous cell prefixes
- Use private object storage
- Use short-lived signed download URLs
- Purge files after the configured retention window
- Log generation and download
- Never place provider credentials in exports
- Apply organization watermark or metadata when desired

---

## Module 15: Destination Integrations

Create a destination adapter interface.

### Initial Destinations

- Google Sheets
- Generic outbound webhook
- n8n webhook
- Make webhook
- Zapier webhook
- Download only

### Future Destinations

- HubSpot
- Salesforce
- GoHighLevel or LeadConnector
- Pipedrive
- ClickUp
- Airtable

Future destinations must remain feature-flagged until implemented and tested.

### Destination Sync Rules

- User selects records and fields
- Preview destination and row count
- Confirm before external write
- Idempotency key prevents duplicate sync
- Map fields explicitly
- Retry transient failures
- Provide per-row errors
- Record remote object IDs
- Support test mode
- Never silently overwrite remote records

---

## Module 16: Integrations Settings

Create categorized integration cards:

### Data Sources

- Apify
- Outscraper

### Decision-Maker and Contact Enrichment

- Apify Business Leads
- Apollo
- Prospeo

### Destinations

- Google Sheets
- Webhook
- n8n
- Make
- Zapier

### Each Integration Card Must Show

- Connected or disconnected
- Capability summary
- Account label
- Environment
- Last tested
- Last successful use
- Health
- Quota or balance when the provider safely exposes it
- Configure
- Test connection
- Rotate credential
- Disconnect
- Documentation link

Never show the full secret after it is saved.

Disconnecting an integration must not delete historical run provenance.

---

## Module 17: Usage, Costs, Quotas, and Entitlements

Build:

- Monthly company records collected
- Decision-makers discovered
- Emails found
- Emails verified
- Phone numbers found
- Exports created
- Destination syncs
- Provider cost
- Cost by run
- Cost by user
- Cost by provider
- Cost by feature
- Estimate-versus-actual variance
- Organization quota
- Per-run cap
- Daily cap
- Monthly cap

### Budget Controls

- Warn at configurable percentage
- Block new paid runs at hard limit
- Allow owners to lower limits
- Require re-authentication to raise limits
- Super-admin cannot silently raise a client limit without an auditable authorized workflow
- Running jobs respect the cap that was approved at start

Do not implement customer billing or automatic charging in Phase 1 unless separately requested.

Keep the usage ledger ready for a future platform-managed-credit model.

---

## Module 18: Dashboard and Analytics

Create an overview page with:

- Searches this month
- Companies collected
- Unique companies
- Decision-makers found
- Verified emails
- Phones found
- Completion rate
- Enrichment success rate
- Duplicate rate
- Export count
- Provider cost this month
- Remaining configured budget
- Recent runs
- Recent failures
- Integration health

Charts must be accessible and must not be used when a simple metric is clearer.

Do not add vanity analytics that do not help users manage quality, cost, or workflow.

---

## Module 19: Notifications

Support in-app notifications for:

- Search completed
- Search partially completed
- Search failed
- Cost cap reached
- Enrichment completed
- Export ready
- Destination sync completed
- Integration disconnected
- Credential test failed
- Monthly budget warning

Optional email notifications may be added later with user preferences.

No notification may contain provider secrets or excessive personal data.

---

## Module 20: Super-Admin Operations Console

Build a secure platform console separate from ordinary organization routes.

Include:

- Platform health
- Queue health
- Provider health
- Failed jobs
- Dead-letter jobs
- Sanitized run metadata
- Feature flags
- Provider rate-card versions
- Commercial-use approval flags
- Organization entitlement status
- Security events
- Audit search
- Retention-job status
- Backup status

Super-admin access must require strong authentication and be fully logged.

Do not expose one organization’s lead data to another organization or to support users by default.

---

# Provider Pricing Snapshot

## Important Pricing Rule

The following prices were verified from public provider pages on **16 July 2026**.

They are planning estimates, not permanent application constants.

The application must use versioned, editable rate cards and show “last verified” dates.

Before enabling a production integration, verify the current provider pricing, plan entitlement, API access, and commercial-use terms.

---

## Apify Platform Plans

Public pricing:

| Plan | Monthly price | Included monthly platform or Store spend | Compute-unit price |
| --- | ---: | ---: | ---: |
| Free | $0 | $5 | $0.20 per CU |
| Starter | $29 plus overage | $29 | $0.20 per CU |
| Scale | $199 plus overage | $199 | $0.16 per CU |
| Business | $999 plus overage | $999 | $0.13 per CU |

Official source:

https://apify.com/pricing

### Maintained Google Maps Actor Event Pricing

Actor:

    compass/crawler-google-places

| Event per 1,000 units | Free | Starter | Scale | Business |
| --- | ---: | ---: | ---: | ---: |
| Scraped places | $4.00 | $3.00 | $2.00 | $1.50 |
| Each billable filter applied | $1.00 | $1.00 | $0.75 | $0.53 |
| Additional place details | $2.00 | $2.00 | $1.50 | $1.05 |
| Company contacts enrichment | $2.00 | $2.00 | $1.50 | $1.05 |
| Successfully extracted business leads | $100.00 | $5.00 | $5.00 | $4.00 |
| Decisive email verifications | $100.00 | $4.00 | $3.00 | $2.00 |
| Social profiles enriched | $100.00 | $8.00 | $7.00 | $6.00 |
| Reviews scraped | $0.50 | $0.50 | $0.37 | $0.26 |
| Images scraped | $0.50 | $0.50 | $0.37 | $0.26 |

Official source:

https://apify.com/compass/crawler-google-places/pricing

### Example: 1,000 Companies on Apify Starter

Assumptions:

- 1,000 scraped places
- One billable filter
- One successfully extracted business lead per company
- One decisive email verification per lead
- No reviews
- No images
- No social-profile detail enrichment

Estimated Actor event charges:

    $3 base places
    + $1 filter
    + $5 business leads
    + $4 email verification
    = approximately $13

The Starter subscription includes $29 of monthly platform or Store spend, so this example may fit inside that included spend if there is no other usage.

Actual cost can differ because the actor charges successful leads and decisive verifications based on real outcomes.

The Free plan is not a sensible choice for Business Leads or email verification because its enrichment event prices are much higher.

---

## Outscraper Google Maps Pricing

Public base pricing:

| Monthly volume | Price |
| --- | ---: |
| First 500 businesses | $0 |
| 501 to 100,000 businesses | $3 per 1,000 |
| Above 100,000 businesses | $1 per 1,000 |

Outscraper advertises pay-as-you-go pricing with no required monthly subscription for this service.

Optional enrichments may add separate charges.

Official source:

https://outscraper.com/google-maps-scraper/

Use Outscraper as a cost-effective base-company source, but do not assume its base rate includes a relevant personal decision-maker, verified work email, mobile phone, or personal LinkedIn URL.

---

## Apollo Pricing and Credits

Public annual-billing prices:

| Plan | Public price per seat per month when billed annually | Public annual credits per seat |
| --- | ---: | ---: |
| Basic | $49 | 30,000 |
| Professional | $79 | 48,000 |
| Organization | $119 | 72,000 |

Public credit usage:

- People API Search: no Apollo credit charge, but it does not return email or phone
- Verified email reveal: up to 1 credit per contact
- Verified phone reveal: 8 credits per number
- Email plus phone: up to 9 credits
- Enrichment endpoints consume credits when qualifying data is returned

Approximate Basic annual-plan credit economics, ignoring the value of other plan features:

    $49 × 12 months ÷ 30,000 credits
    = approximately $0.0196 per credit

Therefore:

- Email only: approximately $0.0196 per successful contact
- Phone only: approximately $0.1568 per successful number
- Email and phone: approximately $0.1764 per successful contact

These are allocation estimates, not guaranteed pay-as-you-go prices.

Official sources:

https://www.apollo.io/pricing

https://www.apollo.io/pricing/about-credits

https://docs.apollo.io/docs/api-pricing

https://docs.apollo.io/reference/people-api-search

### Apollo SaaS Restriction

Apollo’s public pricing page states that public plans are for internal business use and do not permit using the data to power an external product, share it with customers, or resell it under standard terms.

Production SaaS use requires a separate permitted arrangement.

Do not hide or bypass this restriction.

---

## Prospeo Pricing

Public entry pricing:

| Plan | Price | Credits |
| --- | ---: | ---: |
| Free | $0 | 100 per month |
| Paid entry plan | $49 per month | 2,000 per month |

Public credit rules:

- One verified business email uses 1 credit
- One direct mobile number uses 10 credits

Approximate entry-plan allocation:

- Verified business email: $49 ÷ 2,000 = approximately $0.0245
- Direct mobile: 10 credits = approximately $0.245

Official source:

https://prospeo.io/pricing

Use only the API features actually enabled for the connected account.

---

## Recommended Provider Strategy

### Lowest-Complexity MVP

- Apify Starter
- Maintained Google Maps actor
- Base business records
- Optional Apify company contacts
- Optional Apify Business Leads for decision-maker name, title, work email, phone, and LinkedIn URL
- Optional Apify email verification

### Lowest-Cost Base Company Search

- Outscraper for basic company data
- Separate enrichment provider only when required

### Optional Fallback

- Prospeo for supported email or phone operations
- Apollo only after commercial-use approval

Build the adapter system so the platform can compare:

- Cost
- Match rate
- Verification rate
- Latency
- Failure rate
- Data freshness

Do not automatically send the same lead to multiple paid providers unless the user approves a fallback budget.

---

# Database Design

## Required Tables

Create and migrate tables equivalent to:

- organizations
- user_profiles
- organization_memberships
- invitations
- role_permissions
- integration_connections
- integration_secret_versions
- integration_health_checks
- provider_rate_cards
- provider_capabilities
- search_projects
- search_queries
- search_runs
- search_run_stages
- provider_jobs
- provider_webhook_inbox
- provider_raw_records
- companies
- company_sources
- company_emails
- company_phones
- company_social_profiles
- contacts
- contact_sources
- contact_emails
- contact_phones
- enrichment_requests
- enrichment_results
- duplicate_candidates
- merge_events
- lists
- list_companies
- list_contacts
- tags
- company_tags
- contact_tags
- notes
- custom_field_definitions
- custom_field_values
- exports
- export_items
- destination_syncs
- destination_sync_items
- usage_events
- cost_ledger
- quota_policies
- feature_flags
- commercial_use_approvals
- suppression_entries
- data_subject_requests
- audit_logs
- security_events
- notifications

### Tenant Rules

- Every tenant-owned table has organization_id as NOT NULL
- Every tenant-owned table has RLS enabled
- RLS uses active organization membership and role
- Service-role access is limited to server and worker code
- Client-side code never receives the service-role key
- Cross-tenant relationship constraints are tested
- Provider job IDs cannot be used to read another tenant’s results

### Data Constraints

- Provider plus provider record ID is unique in the appropriate organization scope
- Google place ID is unique within source namespace and organization
- Normalized URLs use canonical forms
- Emails are normalized safely
- Phones use E.164 when possible
- Country codes use a defined standard
- Currency uses ISO codes
- Money uses integer minor units or precise numeric types
- Status fields use constrained enums
- Timestamps use UTC

---

# API and Service Boundaries

Build typed endpoints or server actions equivalent to:

### Authentication and Organizations

- Create organization
- Switch organization
- Invite member
- Change role
- Remove member

### Integrations

- List connections
- Create connection
- Test connection
- Replace credential
- Disconnect
- Refresh capabilities
- Read sanitized health

### Searches

- Create draft
- Estimate cost
- Confirm and enqueue
- Read run
- List runs
- Cancel run
- Retry failed stage
- Resume ingestion

### Data

- List companies
- Read company
- Update human-managed fields
- List contacts
- Read contact
- Create list
- Add records to list
- Review duplicate

### Enrichment

- Preview selected records
- Estimate enrichment cost
- Confirm enrichment
- Read enrichment job

### Exports and Destinations

- Preview export
- Create export
- Get short-lived download link
- Preview destination sync
- Confirm destination sync

### Webhooks

- Apify callback
- Apollo phone callback when permitted
- Generic destination callback only when needed

All mutation endpoints require:

- Authentication
- Organization membership
- Permission check
- Schema validation
- Rate limit
- Idempotency where relevant
- Audit record

---

# Tier 3 Production Security

Treat “Tier 3” as a high-assurance internal security target, not as a claim of formal certification.

Use OWASP ASVS Level 2 as the minimum verification baseline and apply stricter controls to secrets, multi-tenancy, paid actions, exports, and personal data.

Official security baseline:

https://owasp.org/www-project-application-security-verification-standard/

## Authentication and Session Security

- Secure cookies
- HttpOnly
- SameSite
- Secure flag in production
- Session rotation
- Session revocation
- Email verification
- Brute-force protection
- Rate limits
- MFA for privileged accounts
- Re-authentication for secrets, cost-limit increases, ownership transfer, organization deletion, and data export

## Authorization and Tenant Isolation

- Server-side permission checks
- Postgres RLS defense in depth
- Deny by default
- No reliance on user-supplied organization IDs
- Derive active organization from verified membership
- Cross-tenant automated tests
- IDOR tests
- Service-role use only in trusted server and worker paths

Supabase RLS reference:

https://supabase.com/docs/guides/database/postgres/row-level-security

## Secret Management

- No secrets committed to Git
- No secrets in frontend bundles
- No secrets in localStorage
- No secrets in logs
- No secrets in error messages
- No secrets in analytics
- No secrets in URLs
- Encrypt provider credentials using envelope encryption or an approved managed secret store
- Separate staging and production secrets
- Support key rotation
- Mask all connection displays
- Log credential create, replace, test, and delete actions without logging the value

## API Security

- Strict request and response schemas
- Maximum payload sizes
- Rate limiting per IP, user, organization, action, and provider
- CSRF protection for cookie-authenticated mutations
- Restrictive CORS
- Parameterized queries
- Output encoding
- Content Security Policy
- Security headers
- No open redirects
- No unsafe dynamic code execution

## Webhook Security

- Treat webhooks as untrusted
- Prefer provider signatures when available
- Use secret callback tokens when signatures are unavailable
- Verify expected provider run ID through the authenticated provider API
- Persist first, process asynchronously
- Idempotency and replay protection
- Timestamp or expiry checks
- Rate limiting
- Payload-size limits
- Schema validation
- Constant-time secret comparison
- Return quickly after safe persistence

## SSRF and External URL Safety

If the application ever fetches a business website directly:

- Allow only HTTP and HTTPS
- Block loopback
- Block link-local
- Block private IP ranges
- Re-resolve DNS safely
- Limit redirects
- Revalidate every redirect target
- Limit response size
- Limit duration
- Restrict ports
- Sanitize HTML
- Do not execute remote scripts
- Prefer delegating website crawling to the configured provider

## Personal Data Protection

- Data minimization
- Purpose limitation
- Source provenance
- Retention policies
- Access logging
- Export logging
- Deletion workflow
- Suppression list
- Data-subject request support
- Organization-level retention controls
- Private exports
- Short-lived download URLs
- PII redaction in logs and error tracking
- No training an AI model on collected personal data without an explicit lawful and approved purpose

## Audit Logs

Log:

- Sign-in security events
- Invitations
- Role changes
- Provider connection changes
- Cost-limit changes
- Search confirmation
- Paid run start
- Cancellation
- Retry
- Enrichment confirmation
- Export generation
- Export download
- Destination sync
- Merge and unmerge
- Retention deletion
- Data-subject request
- Super-admin action
- Feature-flag change
- Commercial-use approval change

Audit records must be append-only for normal users.

## Dependency and Supply-Chain Security

- Lockfile committed
- Dependency audit
- Automated update review
- Secret scanning
- Static analysis
- License inventory
- No unreviewed copy-pasted proprietary code
- GitHub branch protection recommendation
- CI checks before merge
- Build provenance where practical

## Backup and Recovery

- Automated database backups
- Restore test
- Documented RPO and RTO
- Export-file retention separate from database backup
- Encryption in transit
- Encryption at rest
- Rollback plan
- Incident response runbook

---

# Legal, Provider Terms, and Responsible Use

This section is a product requirement, not optional fine print.

## Google Maps and Provider Terms

Google Maps Platform terms restrict scraping, bulk storage, and certain uses of Google Maps content.

Using a third-party scraping provider does not automatically grant the platform unlimited downstream rights.

Before commercial launch:

- Obtain legal review for the intended countries and use cases
- Review Google, Apify, Outscraper, and enrichment-provider terms
- Confirm data storage, export, and resale permissions
- Document attribution requirements
- Document retention requirements
- Create an acceptable-use policy
- Create a provider takedown and suspension process

Google Maps Platform terms:

https://cloud.google.com/maps-platform/terms

## LinkedIn Data

Do not build a direct LinkedIn scraper, browser bot, session-cookie collector, or login automation into this platform.

LinkedIn’s user agreement restricts scraping, automated copying, and unauthorized automation.

Accept LinkedIn URLs only when returned by a provider whose contract permits the intended use, entered manually by an authorized user, or obtained through another lawful and approved method.

LinkedIn user agreement:

https://www.linkedin.com/legal/user-agreement

## Outreach and Anti-Spam

The MVP is for research, organization, review, and export.

It must not automatically send cold email, SMS, LinkedIn messages, or calls.

Any future outreach module requires separate requirements for:

- CAN-SPAM
- TCPA
- GDPR and ePrivacy
- CCPA or CPRA
- CASL
- PECR
- Country-specific direct-marketing laws
- Suppression and opt-out enforcement
- Consent and lawful-basis records

Do not claim legal compliance merely because a checkbox exists.

---

# Dashboard UI

## Main Navigation

- Overview
- Lead Finder
- Search Runs
- Companies
- Decision Makers
- Lists
- Exports
- Integrations
- Usage and Costs
- Team
- Audit Logs
- Settings

Super-admin navigation is separate.

## Visual Direction

The interface should feel:

- Premium
- Clear
- Professional
- Trustworthy
- Modern
- Enterprise-ready
- Calm
- Data-focused

Preferred visual system:

- Light white or very light cool-gray background
- Desaturated deep blue primary color
- Light blue or cyan accent
- Graphite text
- Clear borders
- Moderate radius
- Subtle shadows
- No large dark sections
- No neon colors
- No “AI ninja” styling
- No copied competitor branding

## Lead Finder Page

Include:

- Page title
- Short explanation
- Four-step process strip
- Provider connection badge
- Search form
- Advanced filters drawer
- Decision-maker enrichment section
- Cost and quota panel
- Run confirmation
- Recent searches

Do not claim “instant” results if a provider job is asynchronous.

## Responsive Requirements

Test at:

- 320 px
- 375 px
- 390 px
- 430 px
- 768 px
- 1024 px
- 1280 px
- 1440 px
- 1920 px

Requirements:

- No unintended horizontal page overflow
- Accessible mobile navigation
- Forms stack correctly
- Touch targets are large enough
- Tables use deliberate mobile cards or controlled horizontal scroll
- Bulk actions remain understandable
- Cost confirmation is readable
- Modals fit the viewport
- Mobile keyboards do not hide required actions

## Accessibility

- Semantic landmarks
- Keyboard navigation
- Visible focus
- Accessible labels
- Proper error association
- Sufficient contrast
- Screen-reader status for job progress
- Reduced-motion support
- No color-only status
- Accessible tables and dialogs

Target WCAG 2.2 AA where practical.

---

# Performance and Scalability

## Initial Capacity Target

Design for approximately:

- 10,000 company records per month
- Multiple simultaneous organizations
- Multiple running provider jobs
- Paginated datasets
- Bulk exports
- Optional enrichment

## Performance Rules

- Do not load entire datasets into browser memory
- Use cursor or server pagination
- Stream or page provider ingestion
- Batch database writes
- Use upserts safely
- Index organization ID, provider IDs, domain, phone, place ID, status, and timestamps
- Avoid N+1 queries
- Run exports asynchronously
- Keep web requests short
- Cache only non-sensitive safe data
- Do not cache authenticated lead responses publicly

## Future Scale Path

Document the path to:

- 50,000 or more records per month
- Dedicated worker pools
- Queue partitioning
- Database read replicas
- Partitioned usage and event tables
- Object storage for short-lived raw files
- Provider-specific concurrency controls

Do not prematurely add infrastructure that is not needed for the initial target.

---

# Local Development and Preview

Create:

- .env.example with safe placeholders only
- Local database instructions
- Migration command
- Seed command
- Web application command
- Worker command
- Test command
- Build command
- Provider fixture mode
- Health-check command

## Local Preview Modes

### Deterministic Fixture Mode

- No paid provider call
- Uses redacted provider-like fixtures
- Exercises the full job, ingestion, normalization, dedupe, review, and export flow
- Clearly labeled as test data

### Real Provider Smoke Mode

- Requires the user’s test credentials
- Requires explicit approval before a paid run
- Maximum 10 companies
- Very low maxTotalChargeUsd
- No reviews
- No images
- Decision-maker enrichment optional
- Records stored only in the development organization

Fixture mode is required for automated tests.

Real provider smoke mode is required before claiming the integration is production-ready, unless credentials or commercial approval are unavailable. If unavailable, report that as a concrete blocker rather than pretending it was tested.

---

# Testing Requirements

## Unit Tests

- Cost formulas
- State transitions
- Permission policies
- Normalizers
- URL normalization
- Email normalization
- Phone normalization
- Deduplication
- Match scoring
- Redaction
- Encryption helpers
- Export formula-injection protection

## Database Tests

- Migrations
- Constraints
- RLS
- Cross-tenant access denial
- Role permissions
- Upsert idempotency
- Usage-ledger idempotency
- Merge and unmerge
- Retention behavior

## Provider Contract Tests

- Apify request mapping
- Apify response mapping
- Pagination
- Null fields
- Partial results
- Invalid payload
- Rate limit
- Timeout
- Failed run
- Cancelled run
- Duplicate webhook
- Missing webhook
- Cost reconciliation
- Apollo feature gate
- Outscraper capability mapping
- Prospeo capability mapping

Use redacted fixtures committed to the repository.

## End-to-End Tests

- Sign up
- Create organization
- Connect test provider
- Create search
- Estimate cost
- Confirm
- Run job
- Ingest data
- Deduplicate
- Review company
- Review contact
- Create list
- Export CSV
- Export XLSX
- Confirm usage ledger
- Confirm audit log

## Security Tests

- IDOR
- Cross-tenant reads
- Cross-tenant writes
- Privilege escalation
- Secret exposure
- Log redaction
- Rate limits
- CSRF
- XSS
- SQL injection
- Webhook replay
- Webhook tampering
- Spreadsheet formula injection
- Signed download expiry
- Stale-session access

## Quality Gates

All must pass:

- Formatting
- Type check
- Lint
- Unit tests
- Integration tests
- RLS tests
- End-to-end fixture test
- Production build
- Dependency audit review
- Secret scan

No critical or high-severity security finding may remain unresolved at launch.

---

# DevOps and Production Readiness

## Environments

- Local
- Test
- Staging
- Production

Never share provider credentials or databases across environments.

## CI Pipeline

On pull request:

- Install from lockfile
- Type check
- Lint
- Unit tests
- Database tests
- Build
- Secret scan
- Dependency review

On approved release:

- Migration validation
- Deployment
- Health checks
- Smoke tests
- Monitoring verification

## Production Deployment

Prepare:

- GitHub repository
- Vercel project
- Supabase production project
- Worker deployment
- Environment variables
- Database migrations
- Auth callback URLs
- Provider callback URLs
- Storage policies
- Monitoring
- Error tracking
- Backups
- DNS plan
- Post-deployment smoke test
- Rollback procedure

Do not deploy or change live infrastructure without explicit approval.

## Rollback

Document:

- Web application rollback
- Worker rollback
- Database forward-fix strategy
- Safe migration rollback where possible
- Provider-job pause
- Feature-flag disable
- Credential rotation
- Incident communication

---

# Implementation Phases

## Phase 0: Repository Inspection and Architecture

- Read CLAUDE.md first if present
- Read AGENTS.md, README, package files, environment examples, migrations, and deployment configuration
- Identify existing working functionality
- Inspect Git status
- Preserve user changes
- Produce architecture summary
- Produce implementation plan
- Record assumptions and risks
- Create memory.md for durable project decisions if the repository does not already have an equivalent

## Phase 1: SaaS Foundation

- Monorepo or clean application structure
- Auth
- Organizations
- Roles
- RLS
- Dashboard shell
- Brand configuration
- Integrations framework
- Audit logs
- Local fixture provider

## Phase 2: Core Apify Search

- Apify connection
- Connection test
- Search builder
- Cost estimate
- User confirmation
- Hard cost cap
- Async Actor run
- Callback or polling
- Dataset pagination
- Run status
- Error handling

## Phase 3: Data Normalization and Review

- Company schema
- Source records
- Normalization
- Deduplication
- Companies table
- Company detail
- Lists
- Tags
- Notes

## Phase 4: Decision-Maker Enrichment

- Apify Business Leads
- Target titles
- Contact limits
- Contact schema
- Personal and company LinkedIn distinction
- Email verification
- Optional Apollo feature-gated adapter
- Optional Prospeo adapter
- Cost preview

## Phase 5: Exports and Destinations

- CSV
- XLSX
- Export security
- Google Sheets
- Generic webhook
- n8n
- Sync history

## Phase 6: Usage and Operations

- Usage ledger
- Rate cards
- Cost reconciliation
- Quotas
- Budget warnings
- Notifications
- Super-admin console
- Provider health

## Phase 7: Security, Compliance, and Quality

- Threat model
- RLS test suite
- Security headers
- Rate limits
- Secret encryption
- Webhook hardening
- Retention
- Suppression
- Data-subject workflows
- Full automated tests
- Accessibility
- Responsive review

## Phase 8: Staging and Production Preparation

- Staging deployment
- Real low-cost provider smoke test
- Production environment plan
- Backups
- Monitoring
- Runbooks
- Deployment checklist
- Rollback checklist
- Final go-live approval gate

Do not skip earlier phases to produce attractive screens first.

---

# Immediate First Build Target

Build a working vertical slice where:

1. A user signs in.
2. The user creates an organization.
3. The organization owner connects Apify securely.
4. The connection test succeeds.
5. A researcher enters industry and location.
6. The platform shows an estimated cost and maximum cap.
7. The researcher confirms the run.
8. The run is queued.
9. Apify completes or fixture mode simulates completion.
10. The worker ingests paginated results.
11. Companies are normalized and deduplicated.
12. Results appear in the Companies table.
13. Optional Apify Business Leads returns decision-maker data.
14. Decision-maker and company LinkedIn URLs are stored separately.
15. The user adds selected records to a list.
16. The user exports CSV and XLSX.
17. Usage and audit events are visible.
18. Cross-tenant access is denied.

Complete this vertical slice before expanding to every optional provider.

---

# Claude Code Execution Rules

1. Read CLAUDE.md first when present.
2. Inspect the repository and Git status before editing.
3. Do not overwrite unrelated user changes.
4. Do not rebuild a working project from scratch without a documented reason.
5. Use available official Claude Code skills, project skills, and focused subagents when they materially improve architecture, frontend quality, security review, testing, or DevOps.
6. Keep one execution owner responsible for integration consistency.
7. Maintain memory.md or the repository’s existing decision log.
8. Work in small, testable phases.
9. Implement the vertical slice before optional breadth.
10. Use official provider documentation.
11. Pin dependencies.
12. Do not invent API fields or endpoints.
13. Keep provider adapters isolated.
14. Keep secrets server-side.
15. Add migrations rather than editing production data manually.
16. Run checks after meaningful changes.
17. Fix errors before moving forward.
18. Do not leave critical buttons disconnected.
19. Do not mark fixture data as real data.
20. Do not claim a provider integration is complete without a real low-cost smoke test or a clearly reported credential blocker.
21. Document all manual actions.
22. Ask for approval before external or destructive actions.
23. Continue execution after presenting the initial plan; do not stop after planning unless blocked by credentials, commercial terms, or required approval.

---

# Approval and External Action Rules

You may inspect and modify the repository.

Ask for explicit approval before:

- Creating or changing a live Supabase project
- Changing production RLS policies
- Running production migrations
- Deploying to Vercel or another production host
- Creating paid provider accounts
- Starting a paid provider run
- Raising a provider cost cap
- Changing production environment variables
- Rotating real credentials
- Pushing to a remote Git repository
- Opening a pull request
- Changing DNS or domains
- Sending data to Google Sheets, a webhook, n8n, Make, Zapier, or a CRM
- Exporting real personal data outside the app
- Deleting production data
- Purging organization data
- Enabling Apollo for multi-tenant production use

You may prepare code, migrations, commands, checklists, and deployment plans before approval.

---

# Required Documentation Deliverables

Create:

- README.md
- CLAUDE.md
- memory.md
- docs/ARCHITECTURE.md
- docs/DATA_MODEL.md
- docs/PROVIDER_ADAPTERS.md
- docs/APIFY_INTEGRATION.md
- docs/PROVIDER_PRICING_AND_COSTS.md
- docs/SECURITY.md
- docs/THREAT_MODEL.md
- docs/PRIVACY_AND_COMPLIANCE.md
- docs/LOCAL_SETUP.md
- docs/TEST_PLAN.md
- docs/STAGING.md
- docs/DEPLOYMENT.md
- docs/ROLLBACK.md
- docs/OPERATIONS_RUNBOOK.md
- docs/INCIDENT_RESPONSE.md
- docs/RELEASE_CHECKLIST.md
- docs/KNOWN_LIMITATIONS.md
- .env.example

Documentation must match the actual implementation.

Do not document commands that were not verified.

---

# Deliverables

- Working multi-tenant SaaS dashboard
- Secure authentication
- Organization and role system
- Supabase/Postgres schema
- Database migrations
- RLS policies and tests
- Integrations settings
- Encrypted provider credentials
- Apify provider adapter
- Search builder
- Provider cost estimator
- Hard run cost cap
- Durable job orchestration
- Search-run progress
- Paginated provider ingestion
- Normalized company records
- Optional decision-maker records
- Company and personal LinkedIn URL distinction
- Deduplication
- Companies and Contacts views
- Lists, tags, and notes
- CSV export
- XLSX export
- Usage and cost ledger
- Audit logs
- Super-admin operations foundation
- Responsive UI
- Accessibility baseline
- Security controls
- Automated tests
- Local fixture preview
- Real provider smoke-test procedure
- Staging and production deployment plan
- Rollback plan

---

# Definition of Done

The platform is done only when all applicable requirements below are satisfied.

## End-to-End Functional Flow

    Sign up
        → Create organization
        → Connect Apify in Integrations
        → Test connection
        → Create industry and location search
        → See cost estimate
        → Confirm hard maximum cost
        → Queue run
        → Start provider job
        → Receive or verify completion
        → Ingest paginated dataset
        → Normalize companies
        → Deduplicate companies
        → Optionally enrich decision-makers
        → Review company and contact records
        → Add selected records to a list
        → Export CSV or XLSX
        → Reconcile actual provider cost
        → Write audit trail

## Functional Completion

- All primary navigation routes work.
- The search form validates required fields.
- Country is required.
- Cost estimate is shown before a paid run.
- A hard provider cost cap is sent.
- Duplicate starts do not create duplicate paid jobs.
- Search progress survives page refresh.
- A worker restart can resume ingestion.
- Partial results remain usable.
- Provider failures show actionable errors.
- Company name, address, phone, website, and Maps identifiers are stored when returned.
- Company email is labeled as company email.
- Decision-maker name and title are stored when returned.
- Personal LinkedIn and company LinkedIn are stored separately.
- Email and phone verification states are accurate.
- Missing fields remain null and have clear UI states.
- Deduplication works.
- CSV works.
- XLSX works.
- Export formula injection is prevented.
- Usage records are idempotent.
- Audit logs are written.

## Local Completion

- A new developer can follow README instructions.
- Migrations run.
- Seed data runs.
- Web application starts.
- Worker starts.
- Fixture mode completes end to end.
- Production build succeeds locally.

## Provider Completion

- Apify connection test works with an authorized key.
- A maximum-10-record smoke run works after explicit approval.
- The real response schema is validated.
- Dataset pagination works.
- Actual cost is reconciled.
- If decision-maker enrichment is enabled for the smoke test, the application accurately handles both returned and missing fields.
- Optional providers remain disabled if not tested.

## Security Completion

- No provider secret reaches the browser after storage.
- No secret appears in logs.
- All tenant tables have RLS.
- Cross-tenant tests pass.
- Server authorization passes.
- Rate limits work.
- Webhook replay protection works.
- Export authorization works.
- Download links expire.
- Privileged actions require re-authentication where specified.
- No unresolved critical or high security finding remains.

## UI Completion

- Desktop workflow is complete.
- Mobile workflow is complete.
- No unintended horizontal page overflow.
- Tables have a deliberate mobile strategy.
- Cost confirmation is clear.
- Loading, empty, partial, success, and failure states exist.
- Keyboard navigation works.
- Color contrast and labels are accessible.

## Production Completion

- Staging is configured.
- Production variables are documented.
- Migrations are reviewed.
- Backups are enabled.
- Monitoring is enabled.
- Health checks work.
- Deployment checklist is ready.
- Rollback checklist is ready.
- Real production deployment occurs only after approval.
- Post-deployment smoke tests are documented and executed when deployment is approved.

## Commercial and Legal Completion

- Provider terms have been reviewed for the intended use.
- Apollo remains disabled unless commercial-use approval exists.
- Direct LinkedIn scraping is not implemented.
- Acceptable-use and privacy requirements are documented.
- Retention and deletion workflows work.
- No unsupported claim of legal compliance is made.

Do not call the project finished if only the UI works.

Do not call the project finished if only fixture mode works and the report hides the missing real-provider test.

Do not call the project finished if secrets, RLS, cost caps, exports, or job recovery are incomplete.

---

# Final Reporting Format

When the work is complete, provide:

## 1. Inspection Summary

- Existing or new repository
- Framework
- Architecture
- Database
- Auth
- Deployment
- Existing functionality preserved
- Risks found

## 2. Architecture Implemented

- Web application
- Worker
- Database
- Provider adapters
- Job state machine
- Security boundaries

## 3. Features Completed

- Auth and organizations
- Search
- Cost estimation
- Provider jobs
- Ingestion
- Companies
- Decision-makers
- Deduplication
- Lists
- Exports
- Integrations
- Usage
- Audit logs

## 4. Provider Validation

- Provider
- Account plan
- Test method
- Records requested
- Records returned
- Actual cost
- Missing fields
- Rate limits
- Remaining provider blockers

## 5. Security Results

- RLS
- Cross-tenant tests
- Secret handling
- Webhook security
- Rate limits
- Export security
- Dependency findings

## 6. Quality Results

- Type check
- Lint
- Unit tests
- Integration tests
- End-to-end tests
- Build
- Responsive tests
- Accessibility review

## 7. Documentation Created

- List every document
- State whether it matches verified commands

## 8. Remaining Manual Actions

List only actions that genuinely require:

- Credentials
- Provider commercial approval
- Paid-run approval
- Production access
- DNS
- Legal review
- Final branding

## 9. Production Deployment Plan

- Exact steps
- Environment variables
- Migration order
- Worker deployment
- Callback setup
- Smoke tests
- Monitoring checks
- Rollback

## 10. Definition-of-Done Verdict

State:

- Complete
- Complete with documented external blocker
- Not complete

Do not use “complete” when a required test failed.

---

# Start Instruction

Begin now.

First:

1. Read CLAUDE.md if it exists.
2. Inspect the repository and Git status.
3. Determine whether this is a new build or an existing application.
4. Compare the current code with this master prompt.
5. Produce a concise inspection summary.
6. Produce a phased implementation plan.
7. Record assumptions and blockers.
8. Begin Phase 1 immediately unless a real credential, commercial-use decision, destructive action, or external action requires approval.

You are the principal engineer and execution owner.

Build the full vertical slice.

Test it.

Secure it.

Document it.

Prepare it for staging and production.
