# Production Enhancement Master Prompt: Separate Yelp-via-Apify Integration and Yelp Leads Scraper Tab

## Role

Act as a senior **Claude Code SaaS Platform Architect**, **Full-Stack AI Product Builder**, **AI Automation Engineer**, **Data Platform Engineer**, **DevOps Engineer**, **Security Architect**, **Privacy Engineer**, and **Product Execution Lead**.

You are not only advising me.

You are responsible for **inspecting the existing production codebase, implementing the Yelp enhancement, debugging it, testing it, securing it, documenting it, and preparing a controlled production rollout without regressing working functionality**.

Do not stop at mockups, disconnected screens, placeholder buttons, or recommendations.

Deliver a real, working production enhancement. Do not rebuild or rebrand the existing platform unless a separate instruction explicitly asks for it.

---

## Project Name

Use the existing production product name and brand from the repository.

If the repository still uses a placeholder, **LeadFinder SaaS Platform** may remain the working name.

All user-facing branding must be controlled through one centralized brand configuration so the name, logo, colors, metadata, email sender identity, and support links can be changed later without searching the entire codebase.

Do not rebrand the live product and do not copy the “Ninjas Lead Finder” name, logo, or visual identity from the reference image.

---

## Confirmed Production Context

Unless the repository or the user provides different instructions, use these defaults:

- An existing production multi-tenant SaaS is already deployed and in use
- The current repository, architecture, database, authentication, UI patterns, provider adapters, deployment pipeline, and production behavior are the source of truth and must be inspected before editing
- Apify, Outscraper, and Prospeo are already integrated provider options and must remain working
- Keep the existing credential model for current integrations; add a separate encrypted Yelp-via-Apify connection record and credential flow
- Initial production capacity target of approximately 10,000 collected business records per month
- Global country and location support
- The existing Apify integration remains unchanged; create a separate Yelp-via-Apify integration that runs the new Yelp scraper
- Outscraper remains an existing optional Google Maps company-data source
- Prospeo remains an existing optional contact discovery and verification provider
- Google Maps remains an existing selectable lead source; Yelp is the new selectable lead source added by this change
- Preserve the existing configured Google Maps Actor or provider implementation; do not replace it merely to match this document
- Add `memo23/yelp-scraper` as the approved Yelp leads Actor
- Apify Business Leads and Prospeo as optional enrichment capabilities where their current APIs and the user-selected plan support the requested operation
- Responsive desktop-first dashboard with complete mobile usability
- Preserve the current production hosting platform; use Vercel-specific guidance only if the repository is already deployed there
- Preserve the current production database and authentication stack; use Supabase/Postgres-specific guidance only if that is the deployed stack
- Reuse the existing durable background-job system for long-running provider operations
- Preserve the existing repository and CI/CD workflow

These facts and any repository-confirmed differences must be written into the architecture decision log or existing project memory.

Do not block the enhancement on branding. Preserve the centralized production brand configuration.

---

## Single Change Request

Add Yelp as a new lead source through a **separate Yelp-via-Apify connection and integration** using exactly:

    memo23/yelp-scraper

This is the only new scraping-provider capability requested.

- Keep the existing Apify Google Maps capability working.
- Keep the existing Outscraper option working.
- Keep the existing Prospeo option working.
- Do not describe or redesign the product as Apify-exclusive.
- Add a separate Yelp-via-Apify integration card with its own encrypted Apify API-token secret reference, connection test, Actor-access test, health state, limits, and audit history.
- Add a dedicated **Yelp Leads Scraper** navigation tab and page rather than placing Yelp only inside the existing Lead Finder source selector.
- Do not automatically copy, read, or reuse the existing Google Maps Apify credential. An organization may deliberately enter the same Apify token in both integrations, but each connection must be configured, tested, rotated, disconnected, authorized, and audited independently.
- Do not request a Yelp login, Yelp cookie, or Yelp API key. The separate credential is still an Apify API token scoped operationally to the Yelp integration.
- Do not build a direct Yelp scraper.
- Do not rebuild completed SaaS foundation features.
- Make only the supporting schema, UI, worker, cost, security, testing, documentation, and rollout changes required for the Yelp vertical slice.

---

## Production Change Boundary and Provider Scope

This change extends the existing production platform. It is not a greenfield build and it is not a provider migration.

- Preserve existing user flows, provider connections, secrets, stored leads, saved searches, usage history, exports, billing or entitlements, and public routes.
- Prefer additive code and backward-compatible database migrations.
- Do not rename existing provider identifiers, database enums, environment variables, or integration records without a proven need and a tested compatibility migration.
- Put Yelp behind an independently controllable feature flag and legal-enablement flag. Default the production flag off until staging and approval gates pass.
- Do not send production traffic, alter live data, run a paid Actor, change infrastructure, or deploy without explicit approval.
- Provide a rollback that disables Yelp without affecting Apify Google Maps, Outscraper, or Prospeo.
- Give the Yelp integration and Yelp Leads Scraper tab independent feature, connection, legal-enablement, quota, and emergency-disable states.

The approved provider set remains **Apify, Outscraper, and Prospeo**.

- Apify is a primary provider, but the platform is not restricted to one provider.
- The new Yelp-via-Apify connection is a separate integration instance and product surface within the Apify provider family; it is not a fourth external provider.
- Google Maps collection may run through the approved Apify Google Maps Actor or the supported Outscraper Google Maps API.
- Yelp collection must run through the approved Apify Actor `memo23/yelp-scraper` using the separate Yelp-via-Apify connection. This is a distinct product integration and credential record, but it is still powered by Apify rather than a direct Yelp API.
- Prospeo may be used only for contact discovery, work-email verification, and other capabilities explicitly supported by its current API and the connected account.
- Do not add a fourth scraping or enrichment provider as part of this change.
- Do not build a direct in-house Yelp, Google Maps, website, or LinkedIn scraper.
- Keep each provider behind a typed adapter and capability manifest so provider-specific inputs and outputs do not leak into the domain model.
- Store all connected credentials encrypted and use them only from trusted server or worker code.
- Use an admin-controlled Actor allowlist. Tenant users must never supply an arbitrary Actor ID or arbitrary executable Actor input.
- Actor identifiers, approved builds, input schemas, output schemas, capabilities, and rate cards must be configurable by a platform administrator and versioned.
- A fallback may use only an enabled provider whose capability matches the requested operation. Never start a paid fallback silently; show its provider, estimated cost, and consequences, then require user confirmation.
- If the Yelp Actor is unavailable, incompatible, legally blocked, or fails its smoke test, show Yelp as unavailable. Do not scrape Yelp directly or route it through an unapproved provider.

---

## Production Safety Contract

- Establish the deployed commit, active schema version, queue version, feature-flag state, and current health baseline before editing.
- Use expand-and-contract migrations when a schema change is unavoidable. New and previous application versions must coexist safely during rollout.
- Do not drop, rename, or rewrite production columns or tables for this feature.
- Do not run a synchronous full-table backfill in a deployment request. Use a bounded, resumable background backfill only if existing records require it.
- Keep new fields nullable until every deployed writer and reader supports them.
- Keep Yelp disabled until its code, migration, worker, monitoring, and rollback paths are deployed and verified.
- Treat rollback as feature disablement plus application rollback; do not delete Yelp records merely to roll back code.
- Add dashboards or queries for Yelp run count, failure rate, queue latency, cost variance, schema-validation failures, duplicates, and ingestion lag.
- Define rollout abort thresholds before production enablement.
- Never expose one organization’s existing or new Yelp data to another organization during migration, backfill, support, or debugging.

---

## Main Goal

Extend the existing secure lead intelligence SaaS so an authorized user can:

1. Enter an industry, business type, or search term.
2. Use the existing Lead Finder for Google Maps or open the dedicated Yelp Leads Scraper tab for Yelp.
3. Select a country and optionally narrow the search by state, region, city, postal code, or radius.
4. Choose an available provider for the selected lead source and set only the filters that provider supports.
5. Preview the estimated provider or Actor cost before running the search.
6. Start an asynchronous provider job.
7. Track progress, failures, partial completion, cost, and result counts.
8. Review normalized and deduplicated company records.
9. Optionally request company contact email enrichment through a configured capability from Apify, Outscraper, or Prospeo.
10. Optionally request decision-maker or work-contact data through Apify Business Leads or Prospeo where the current capability explicitly supports it.
11. Store personal and company LinkedIn profile URLs only when an approved provider lawfully returns them.
12. Organize records into lists with tags, notes, owners, and statuses.
13. Export selected data to CSV or XLSX.
14. Send selected data to approved destinations such as Google Sheets, a webhook, n8n, Make, Zapier, or a CRM adapter.
15. Track provider usage and cost by organization, user, run, provider, Actor when applicable, source, and feature.
16. Maintain complete audit, security, and data-provenance records.

The Yelp enhancement must work end to end in local development and staging, then be ready for a controlled production rollout. Every existing production workflow must continue to work.

---

## Core Product Vision

The primary workflow is:

    Entry point: Lead Finder or Yelp Leads Scraper
        → Google Maps provider selection or separate Yelp connection check
        → Cost estimate
        → User confirmation
        → Queued provider job
        → Google Maps or Yelp company data
        → Normalization
        → Deduplication
        → Optional company-contact discovery
        → Optional decision-maker discovery
        → Optional email and phone enrichment
        → Review
        → List
        → Export or destination sync
        → Usage and audit reconciliation

The experience should feel simple to a non-technical user, while the implementation remains modular, observable, secure, and independent of any one provider or Actor response shape.

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

Do not place provider API tokens inside the Lead Finder or Yelp Leads Scraper search forms.

Apify, Yelp-via-Apify, Outscraper, and Prospeo credentials belong only in **Settings → Integrations** and must never be stored in localStorage, sessionStorage, browser-readable cookies, frontend state persistence, URL parameters, analytics payloads, or client-side source code.

The search screen must show sanitized connection and capability status, such as “Apify connected” or “Outscraper unavailable,” without revealing a secret.

---

## Non-Negotiable Product Principles

- Preserve the real multi-tenant SaaS architecture; do not reduce this feature to a single-user script.
- Keep all provider and Apify Actor integrations behind typed adapter interfaces.
- Never couple the database schema directly to one provider or Actor response shape.
- Treat all provider responses and webhooks as untrusted input.
- Run long operations asynchronously.
- Make every job resumable and idempotent.
- Add cost caps before paid jobs start.
- Reconcile estimated cost with provider-reported actual cost.
- Enforce organization isolation in both application code and database policies.
- Use secure server-side secret handling.
- Extend the existing audit logging for every new Yelp action.
- Maintain raw-source provenance without exposing raw secrets.
- Provide usable partial results when a provider partially succeeds.
- Use feature flags for unfinished, legally gated, or commercially restricted integrations.
- Do not expose unavailable features as if they work.
- Do not add automatic outreach as part of this change.
- Do not send messages, emails, CRM writes, or production exports without an explicit user action and confirmation.

---

## Existing Production Architecture Guardrails

The repository’s deployed architecture is authoritative. The following patterns are quality guardrails, not permission to migrate frameworks, replace infrastructure, change authentication, or reorganize the repository. Reuse existing conventions unless they create a concrete security or correctness blocker for Yelp; document any such blocker before proposing a broader change.

### Repository

If the existing repository is a TypeScript monorepo, preserve its current boundaries. A representative separation is:

- apps/web — Next.js SaaS dashboard and authenticated API layer
- apps/worker — durable background jobs and provider orchestration
- packages/core — domain models, policies, validation, and state machines
- packages/db — schema, migrations, queries, RLS tests, and seed data
- packages/providers — provider adapter interfaces and implementations
- packages/security — encryption, redaction, signatures, authorization helpers
- packages/ui — reusable accessible UI components
- packages/config — typed environment and brand configuration
- packages/testing — fixtures, provider contract tests, and test utilities

Do not create a monorepo or move working packages solely to match this example.

### Frontend

- Preserve the current production frontend framework and routing model
- TypeScript strict mode
- Tailwind CSS
- Accessible component system
- Server Components where appropriate
- Client Components only where interaction requires them
- Typed forms and schemas
- Responsive design
- Error boundaries
- Loading, empty, partial, and failure states

Do not upgrade framework versions for this feature unless required for a proven security or compatibility reason. Inspect compatibility, pin versions, and preserve the lockfile.

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

- Preserve the existing production database; apply the Postgres and Supabase requirements below only where they match the deployed stack
- SQL migrations committed to source control
- Row-Level Security for all organization-owned tables
- Foreign keys and check constraints
- Unique indexes for provider identifiers and deduplication
- Transactional writes for state changes
- Soft deletion where recovery is useful
- Explicit retention jobs
- Database backup and restore procedure

### Authentication

- Preserve the existing production authentication provider and session model
- Email and password
- Password reset
- Email verification
- OAuth-ready structure
- Optional magic link
- Multi-factor authentication for super-admin and privileged production access
- Secure, HttpOnly, SameSite cookies
- Session rotation and revocation

### Deployment

- Preserve the existing web hosting platform
- Preserve the existing database and authentication services
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

The following modules describe the existing product capabilities that this change must preserve and the integration points Yelp must reuse. Do not rebuild completed modules. Inspect them, add the smallest Yelp-specific delta, and regression-test every affected path.

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

Preserve the existing onboarding flow and extend it for the separate Yelp integration:

1. Create or join organization.
2. Choose default country, language, and currency.
3. Preserve the existing Apify, Outscraper, and Prospeo connection steps.
4. Offer a separate optional **Connect Yelp via Apify** step.
5. Save the Yelp Apify token to a new encrypted Yelp-connection secret reference; never clone the existing Apify secret automatically.
6. Test the Yelp token and access to `memo23/yelp-scraper` independently.
7. Load and display the Yelp Actor capability, schema, rate-card, legal-gate, and health status.
8. Configure Yelp-specific per-run and monthly limits.
9. Set data-retention preferences.
10. Review acceptable-use and data-compliance acknowledgement.
11. Run a maximum-10-record low-cost Yelp smoke search after explicit approval.

The user may skip the Yelp integration and continue using every existing feature. Google Maps collection remains available through its current Apify or Outscraper connections, and Prospeo remains available for its current enrichment capabilities.

The Yelp Leads Scraper tab must remain in a disconnected or disabled state until its own Yelp-via-Apify connection is healthy, `memo23/yelp-scraper` passes its independent smoke test, its price and schema are approved, and the Yelp legal gate is satisfied.

---

## Module 3: Lead Finder Search Builder

Preserve the existing Lead Finder search form for Google Maps and its current providers. Do not force Yelp into this page now that Yelp has its own dedicated tab.

### Required Fields

- Search or campaign name
- Lead source: preserve the existing Google Maps behavior
- Collection provider: Apify or Outscraper, when connected and healthy
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

- Enable contact or decision-maker discovery using Apify Business Leads or Prospeo where the selected capability supports it
- Preferred enrichment provider
- Optional approved fallback enrichment provider
- Maximum contacts per company
- Target job titles
- Target seniority
- Target departments
- Strict title match or similar titles
- Require personal LinkedIn URL
- Request work email
- Verify work email
- Request mobile or direct phone

Hide or disable fields that the selected provider capability does not publish. Prospeo must not be described as finding a decision-maker from a domain unless the exact current endpoint supports that operation and its contract test passes. Yelp-specific inputs and website-email options belong on the dedicated Yelp Leads Scraper page.

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

- Selected collection provider
- Lead source
- Approved Actor identifier when Apify is selected
- Provider capability and schema version
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

Create a provider- and Apify Actor-aware cost estimator.

Do not hardcode one static price as permanent truth.

Implement:

- Versioned provider plan, endpoint, and Actor rate cards
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

For the maintained Google Maps Actor, model selected event charges:

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

For the approved Yelp Leads Actor, model at least:

    Estimated cost =
        emitted business results × result rate
        + review-detail events × review-detail rate
        + businesses receiving optional email enrichment × current documented email-enrichment rate, when separately billed
        + businesses receiving optional review insights × review-insights rate
        + businesses receiving optional AI analysis × AI-analysis rate
        + Actor-start events
        + any Apify usage not included in the Actor event price

Resolve the Apify plan, quota, balance, rate card, and hard-cap policy from the separate Yelp-via-Apify connection. Never borrow the existing Google Maps Apify connection’s plan or budget implicitly.

Do not infer a missing event price. If the live Actor rate card does not expose a required optional-event rate, disable that option or require an administrator to enter and verify a conservative rate before it can be used in a paid run.

### Outscraper Estimate Formula

For Google Maps collection through Outscraper, calculate the applicable tiered price from the number of records requested and the current account or endpoint rate card:

    Estimated cost =
        billable Google Maps records by pricing tier
        + optional enrichment units explicitly selected by the user
        + any documented minimum or job charge

Do not assume that an optional website-contact result is a named decision-maker. Treat returned emails and social URLs according to the endpoint’s documented field definitions.

### Prospeo Estimate Formula

For Prospeo, calculate cost from the current credit schedule for each selected capability:

    Estimated credits =
        email-finder attempts or successful results according to current billing rules
        + email-verification operations
        + phone or mobile lookup operations
        + any other explicitly enabled supported endpoint

Convert credits to an estimated monetary cost only when the connected plan and current credit allocation are known. Otherwise show credits and a clearly labeled cost range rather than false precision.

### Mandatory Run Caps

For Apify, send both:

- A result or paid-item cap where supported
- maxTotalChargeUsd on the Actor run

The run must never start without a server-calculated hard cost cap.

For Outscraper and Prospeo, use every provider-supported result, request, page, credit, or monetary limit. Also enforce an internal organization budget reservation and abort further pagination or enrichment before the approved cap can be exceeded. If a provider cannot guarantee a server-side monetary cap, say so in the confirmation UI and use a conservative maximum result or credit limit.

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
- Provider integration connection ID, including the separate Yelp connection ID
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
- Resolve and persist the exact organization-scoped connection before the paid call; Yelp may use only the separate Yelp-via-Apify connection
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

## Module 6: Existing Apify Google Maps Integration

Preserve the existing typed Apify Google Maps adapter and its working behavior.

If the existing production configuration uses the following Actor, preserve it:

    compass/crawler-google-places

If production uses a different approved Google Maps Actor, the repository and stored configuration win. Do not replace it as part of the Yelp change. Keep any Actor identifier configurable because pricing, input schemas, or product choices may change.

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

## Module 7: Separate Yelp-via-Apify Integration and Yelp Leads Scraper Tab

Create a distinct Yelp product integration powered by Apify. Reuse shared server-side Apify client primitives and the existing durable job orchestration where safe, but do not reuse the existing Google Maps Apify connection record or secret reference automatically.

Default Actor:

    memo23/yelp-scraper

This is a community-maintained Apify Actor. Keep the Actor identifier and approved build configurable, but only platform administrators may change them. A tenant may choose Yelp as a source but may not choose an arbitrary Actor.

### Separate Yelp-via-Apify Connection

Create a dedicated integration type or capability-scoped connection equivalent to:

    integration_key: yelp_apify
    provider_family: apify
    source: yelp
    actor_id: memo23/yelp-scraper

Adapt these identifiers to the existing repository conventions, but keep the Yelp integration unambiguously separate from the existing Google Maps Apify integration.

The Yelp connection must have its own:

- Organization-scoped connection ID
- Encrypted Apify API-token secret reference
- Account or workspace label
- Actor ID and approved build
- Connection and Actor-access test
- Capability and schema version
- Apify plan tier when safely available
- Default maximum results
- Per-run and monthly cost limits
- Connection status
- Legal-enablement status
- Last tested time
- Last successful use
- Sanitized last error
- Credential rotation and disconnect actions
- Audit history

Never copy or expose the token from the existing Apify Google Maps connection. If the organization chooses to use the same token value for both integrations, it must submit and confirm it through the Yelp integration form. Store a separate secret reference and preserve independent rotation and disconnection behavior.

Disconnecting the Yelp integration must block new Yelp runs without disconnecting or changing Apify Google Maps, Outscraper, or Prospeo. It must not delete historical Yelp leads, costs, runs, or provenance.

### Dedicated Yelp Leads Scraper Navigation Tab

Add a first-class authenticated sidebar or main-navigation item labeled:

    Yelp Leads Scraper

Use a dedicated route following existing conventions, preferably:

    /yelp-leads

Do not hide the entire navigation item merely because the Yelp connection is missing. Authorized users should be able to open the page, understand the feature, and see a safe **Connect Yelp via Apify** call to action. Respect organization entitlements and feature flags.

The dedicated page must include:

- Page title and short truthful explanation
- Yelp-via-Apify connection and Actor-health banner
- Connect, reconnect, test, or open-integration-settings action according to state
- Approved Actor ID and last-verified pricing date
- Search form using structured fields
- Advanced options drawer
- Cost estimate and hard-cap panel
- Explicit paid-run confirmation
- Current run progress
- Recent Yelp runs
- Yelp leads preview or results table filtered to the Yelp source namespace
- Add-to-list, export, and optional Prospeo-enrichment actions using existing permissions
- Loading, disconnected, legally disabled, unsupported market, empty, partial, success, cancelled, and failure states

Reuse existing accessible components and normalized company workflows. Do not duplicate authentication, organizations, tables, exports, lists, usage ledgers, or worker infrastructure solely to create the new tab.

### Yelp Tab Authorization

- Viewer may view permitted Yelp results but cannot connect, run, enrich, or export.
- Researcher may create and confirm Yelp searches within entitlement and budget.
- Organization Admin and Owner may configure and test the Yelp connection.
- Only Organization Owner or another explicitly permitted privileged role may replace or disconnect the Yelp credential.
- Super Admin may control platform allowlisting and legal enablement but must not see tenant tokens or lead contents by default.
- Enforce every rule server-side and through tenant isolation policies.

Before production enablement:

- Review the Actor’s current README, input schema, output schema, pricing, maintainer status, recent issues, and terms.
- Pin an approved Actor build or version when Apify supports it.
- Run a real maximum-10-record smoke test using the exact production adapter.
- Store the approved schema hash, pricing verification date, reviewer, and smoke-test result.
- Disable new paid runs automatically if a breaking schema or pricing change is detected until re-approved.

### Yelp Search Input

The user-facing form accepts structured fields rather than a raw URL:

- Industry or search term
- Country
- State or region
- City
- Postal code
- Maximum results
- Fetch full business details
- Collect public company email from the business website
- Collect reviews
- Maximum reviews per business

Expose only countries and locations that the current Yelp site and approved Actor can serve reliably. Do not imply complete global Yelp coverage. If a market is unsupported, disable the run with a clear reason rather than translating it into an unverified location.

Build the Yelp search URL server-side with strict encoding. Allow only documented Yelp search or business URLs on an approved Yelp-domain allowlist. Reject userinfo, fragments, unsupported schemes, IP-literal hosts, redirects to unapproved hosts, and arbitrary URLs.

Map the approved input to:

- `startUrls`
- `maxItems`
- `fetchBusinessDetails`, normally true
- `scrapeReviews`, false by default
- `maxReviews`, bounded by organization entitlement
- `enrichEmails`, false by default
- `maxConcurrency`, controlled only by the server
- Approved Apify Proxy settings controlled only by the server

Never accept raw proxy configuration, concurrency, callback URL, storage identifier, or arbitrary Actor input from a browser request.

### Yelp Output Mapping

Map available fields into the normalized company model:

- Yelp business ID
- Yelp business URL
- Business name
- Rating
- Review count
- Claimed status
- Price level
- Categories
- Full address
- City
- State or region
- Postal code
- Country when returned or derived safely from the requested location
- Phone number
- Website
- Root domain
- Hours
- Business description or about text when permitted
- Business owner name when returned
- Services or amenities
- Photos or photo count only when requested and permitted
- Retrieval timestamp
- Contact email and contact website only when optional email enrichment is enabled and returned

Do not require every optional field.

### Yelp Data Truthfulness

- A contact email discovered from the business website is a **company contact email**, not a Yelp-provided email and not a decision-maker email.
- An owner name returned from a business page is a sourced owner candidate; it is not automatically a verified decision-maker identity.
- Do not claim email verification unless the Actor returns explicit verification metadata with a documented meaning.
- Do not infer or fabricate personal LinkedIn URLs, direct mobile numbers, names, or job titles.
- Yelp search results do not guarantee a website, email, owner name, or complete geographic coverage.
- Reviews are disabled by default because they add cost, storage, copyright, and retention concerns.

### Optional Existing Prospeo Enrichment After Yelp

After Yelp company records are normalized, the user may explicitly send eligible companies or known people through the existing Prospeo workflow if its current capability accepts the available inputs.

- Keep this as a separate enrichment step with its own preview, credit estimate, confirmation, job, provenance, and audit event.
- Do not automatically enrich every Yelp result.
- Do not spend Prospeo credits for records that lack the required person or company identifiers.
- Never imply that `memo23/yelp-scraper` itself returned a Prospeo email, phone, LinkedIn URL, or decision-maker.

### Yelp Cost and Safety Defaults

- `fetchBusinessDetails`: true
- `enrichEmails`: false
- `scrapeReviews`: false
- AI pain-point analysis: false
- Review insights: false
- Maximum 100 results for the first production preset
- Maximum 10 results in real smoke mode
- Server-calculated `maxTotalChargeUsd` required
- Result cap required
- No automatic retry that can create a second paid Actor run

### Yelp Legal Gate

Yelp’s current terms restrict automated scraping and data extraction except where expressly permitted. Using an Apify Actor does not itself prove that Yelp permits the intended collection, retention, export, or commercial use.

Before production enablement, require a documented legal and terms review for the intended countries and use case. The platform must support disabling Yelp globally or per organization without affecting Google Maps runs.

---

## Module 8: Existing Optional Outscraper Google Maps Integration

Preserve the existing Outscraper implementation behind its typed company-source adapter.

Outscraper is an optional Google Maps source, not a Yelp source and not a general decision-maker guarantee.

### Outscraper Connection Settings

- API key
- Account label
- Environment
- Enabled Google Maps endpoint and version
- Default maximum results
- Default per-run budget
- Connection status
- Last successful connection test
- Last provider error
- Credential rotation action

Apply the same secret-storage, server-only usage, re-authentication, audit, log-redaction, and environment-separation requirements used for Apify.

### Outscraper Capability Rules

- Load a versioned capability manifest from the exact API and plan in use.
- Expose only inputs supported by the current Google Maps endpoint.
- Support base company fields such as name, categories, address, location, phone, website, Google identifiers, rating, reviews count, and business status when returned.
- Treat optional emails, social URLs, and website contacts according to the provider’s documented provenance.
- Do not label a website contact as a verified decision-maker unless the response explicitly identifies and verifies that person.
- Preserve provider record IDs, request IDs, retrieval time, pricing version, and raw schema version.
- Use provider-supported asynchronous status or pagination patterns and make ingestion resumable and idempotent.

### Outscraper Selection and Fallback

- A user may select Outscraper directly for a Google Maps run when connected and healthy.
- The UI may recommend Outscraper or Apify based on capability, estimated cost, quota, and health, but it must explain the recommendation.
- Never switch a confirmed Apify run to Outscraper, or vice versa, without a new cost estimate and explicit user confirmation.
- A failed provider job must not automatically create a second paid job with the other provider.

---

## Module 9: Existing Optional Prospeo Contact Enrichment Integration

Preserve the existing Prospeo implementation behind its typed enrichment adapter separate from company collection.

Prospeo may provide supported capabilities such as work-email discovery, email verification, known-person or company contact lookup, and phone lookup. The exact enabled capabilities must come from the current official API, connected plan, and passing contract tests.

### Prospeo Connection Settings

- API key
- Account label
- Environment
- Plan or credit tier when safely available
- Enabled endpoint capabilities
- Per-run and monthly credit limits
- Connection status
- Last successful connection test
- Last provider error
- Credential rotation action

### Prospeo Enrichment Rules

- Require a supported, validated input such as a known person plus company or another exact endpoint input.
- Never claim that Prospeo identifies a decision-maker from a company domain unless the currently implemented endpoint explicitly does so.
- Preserve returned status, confidence, verification result, provider request ID, retrieval time, and source metadata.
- Keep work email, general company email, direct phone, company phone, personal LinkedIn URL, and company LinkedIn URL as distinct fields.
- Do not overwrite a verified human-reviewed value with a weaker provider value.
- Estimate credits before the run and reserve the approved maximum in the usage ledger.
- Cache successful immutable verification results for a documented freshness period when provider terms permit it.
- Do not re-run a billable lookup on retry when an idempotent stored result already exists.

Prospeo is optional. Base Google Maps or Yelp company collection must still work when Prospeo is disconnected.

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
- Yelp business ID
- Yelp business URL
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

1. Exact provider record ID within the provider and lead-source namespace, including Google place ID or Yelp business ID
2. Exact normalized root domain
3. Exact normalized E.164 phone
4. Normalized company name plus full address
5. Normalized company name plus city, region, and postal code

Do not automatically merge weak matches.

Create a review queue for ambiguous matches.

### Contact Deduplication Priority

1. Exact provider-returned person ID within the provider and source namespace
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
- Never place any provider token, API key, or secret reference in exports
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

Preserve the existing integrations UI and add a separate **Yelp via Apify** integration card. The new card must not replace, merge with, or mutate the existing Apify Google Maps connection.

### Existing Provider Options

- Existing Apify API connection and Google Maps capabilities
- Outscraper API connection for its existing Google Maps capabilities
- Prospeo API connection for its existing supported enrichment and verification capabilities
- Separate Yelp via Apify connection for `memo23/yelp-scraper`

Do not remove, rename, hide, or disable Outscraper or Prospeo while adding Yelp.

### Separate Yelp via Apify Card

- Card label: Yelp via Apify
- Purpose label: Powers the Yelp Leads Scraper tab
- Separate encrypted Apify API token input
- Approved Yelp Actor: `memo23/yelp-scraper`
- Approved Actor build and schema version
- Base business scraping capability
- Optional Yelp company-email enrichment capability
- Optional reviews capability
- Current pricing verification date
- Default result and cost limits
- Legal-enablement state
- Test token and Actor access
- Rotate credential
- Disconnect Yelp only
- Link to the dedicated Yelp Leads Scraper tab

The card must ask for an Apify API token, not a Yelp login, Yelp cookie, or Yelp API key. It must never permit a tenant to enter an arbitrary Actor ID.

### Existing Apify Card

Keep the existing Apify card and Google Maps Actor configuration unchanged, including Apify Business Leads where already supported. Do not add the Yelp secret to this record and do not disconnect it when the separate Yelp card is disconnected.

### Destinations

- Google Sheets
- Webhook
- n8n
- Make
- Zapier

### Each Provider Integration Card Must Show

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

### Each Approved Apify Actor Row Must Show

- Source name
- Approved Actor ID
- Approved build or version
- Enabled or disabled
- Capability manifest
- Schema verification state
- Pricing last verified
- Last smoke test
- Last successful run
- Health and current blocker

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
- Cost by provider, Apify Actor when applicable, and lead source
- Cost and usage by integration connection ID so Yelp-via-Apify remains distinguishable from the existing Apify connection
- Cost by feature
- Estimate-versus-actual variance
- Organization quota
- Per-run cap
- Daily cap
- Monthly cap
- Separate Yelp per-run and monthly caps that do not overwrite existing provider limits

### Budget Controls

- Warn at configurable percentage
- Block new paid runs at hard limit
- Allow owners to lower limits
- Require re-authentication to raise limits
- Super-admin cannot silently raise a client limit without an auditable authorized workflow
- Running jobs respect the cap that was approved at start

Do not change the existing customer billing or charging model as part of this Yelp enhancement unless separately requested.

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
- Separate Yelp-via-Apify connection and Actor health

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
- Existing Apify, separate Yelp-via-Apify Actor, Outscraper, and Prospeo connection health
- Failed jobs
- Dead-letter jobs
- Sanitized run metadata
- Feature flags
- Provider rate-card versions
- Source legal-enablement and Actor-approval flags
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

The following prices were verified or recorded from public provider pages on **18 July 2026**.

They are planning estimates, not permanent application constants.

The application must use versioned, editable rate cards and show “last verified” dates.

Before enabling Yelp in production, verify the current provider and Actor pricing, plan entitlements, input and output schemas, API access, maintainer status, and commercial-use terms. Preserve the live system’s existing rate cards for Apify Google Maps, Outscraper, and Prospeo unless a separately reviewed rate-card migration is required.

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

## Apify Yelp Leads Actor Pricing

Default Actor:

    memo23/yelp-scraper

Public event pricing:

| Event | Public price |
| --- | ---: |
| Business result emitted | $2.75 per 1,000 |
| Review details fetched | $1.50 per 1,000 |
| AI pain-point analysis | $50.00 per 1,000 businesses analyzed |
| Deterministic review insights | $20.00 per 1,000 companies analyzed |
| Actor start | $0.009 per applicable start event |
| Platform usage | Listed as included on the Actor pricing page at verification time |

Official source:

https://apify.com/memo23/yelp-scraper/pricing

The Actor documentation states that optional email enrichment is opt-in and may be billed when an email is found. If a separate email-enrichment event and price are not visible in the current live rate card, do not guess. Disable the option or require a verified conservative administrator rate card before a paid run.

### Example: 1,000 Yelp Businesses

Assumptions:

- 1,000 emitted business results
- Full business details
- No reviews
- No email enrichment
- No review insights
- No AI analysis
- One minimum Actor-start event

Planning estimate:

    $2.75 business results
    + $0.009 Actor start
    = approximately $2.759

The Apify Free plan’s $5 monthly usage allowance could theoretically cover roughly 1,800 base Yelp results at the listed result rate, before any optional events or other Apify usage. The Starter plan’s $29 allowance could theoretically cover roughly 10,500 base Yelp results. These are planning estimates, not guarantees.

### Actor Pricing Safety

- Refresh the live pricing manifest before production enablement and on a scheduled basis.
- Store the exact rate-card version used for each estimate.
- Add a conservative uncertainty buffer to every estimate.
- Require a server-side result cap and `maxTotalChargeUsd`.
- Never enable reviews, email enrichment, review insights, or AI analysis implicitly.
- Stop new runs when the Actor’s pricing or schema changes until the change is reviewed.

---

## Outscraper Google Maps Pricing

The public Outscraper Google Maps Scraper page lists pay-as-you-go pricing with no required monthly fee:

| Monthly volume tier | Public price |
| --- | ---: |
| First 500 businesses | $0 |
| 501 to 100,000 businesses | $3.00 per 1,000 |
| Above 100,000 businesses | $1.00 per 1,000 |

Official source:

https://outscraper.com/google-maps-scraper/

Optional emails, contacts, reviews, images, or other enrichments may have separate prices. The estimator must use the exact live endpoint and account rate card rather than assuming every optional field is included.

Example planning estimates for base Google Maps records, before separately billed options:

| Requested volume | Approximate listed base cost |
| --- | ---: |
| 500 | $0 |
| 1,000 | $1.50 if the first 500 remain free and the next 500 use the $3/1,000 tier |
| 10,000 | $28.50 under the same tier interpretation |

Confirm how Outscraper applies the free tier to the connected account before displaying these values as a guaranteed quote.

---

## Prospeo Pricing

The public pricing page previously showed these entry points at the verification date:

| Plan | Public monthly price | Included credits |
| --- | ---: | ---: |
| Free | $0 | 100 credits per month |
| Entry paid plan | $49 per month | 2,000 credits per month |

Recorded public credit examples:

- Verified business email operation: 1 credit when billed under the current rule
- Direct mobile operation: 10 credits when billed under the current rule

Official source:

https://prospeo.io/pricing

Prospeo pricing and billing rules may be rendered dynamically and may change by endpoint or plan. Re-read the live pricing and API documentation, confirm whether credits are charged per request or successful result, and update the versioned rate card before enabling a paid production capability. Do not infer a cash cost when the connected plan is unknown.

---

## Multi-Provider Execution Strategy

### Google Maps Leads

- Preserve both existing choices: the configured Apify Google Maps Actor and Outscraper Google Maps.
- Collect base business records through the provider the user selects.
- Show capability and cost differences before confirmation.
- Allow Apify company contacts, Apify Business Leads, Prospeo enrichment, and other already implemented supported capabilities only as explicit paid options.

### Yelp Leads

- Add `memo23/yelp-scraper` through the separate Yelp-via-Apify integration.
- Collect business profile, phone, website, address, rating, categories, hours, and Yelp identifiers when returned.
- Keep reviews and website-email enrichment off by default.
- Treat returned contact email as a company email.
- Do not promise personal LinkedIn URLs, direct mobile numbers, or verified decision-makers from Yelp.

### Prospeo Enrichment

- Preserve the current Prospeo integration and supported endpoints.
- Use it only after the user selects the corresponding enrichment and accepts the credit estimate.
- Do not treat Prospeo as a company-source replacement for Google Maps or Yelp.
- Do not promise a named decision-maker, verified email, mobile number, or LinkedIn profile unless the exact response supports that label.

### Provider Failure and Fallback

If a provider or Actor fails or lacks a field:

- Preserve partial results.
- Show the missing capability honestly.
- Allow a safe, idempotent retry of the same provider when appropriate.
- Offer an already integrated alternative only when it supports the same source and requested capability.
- Re-estimate cost and require explicit confirmation before any paid cross-provider fallback.
- Do not route Yelp through Outscraper or Prospeo; Yelp uses `memo23/yelp-scraper` in this release.
- Do not scrape the target directly from application infrastructure.

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
- The organization may have separate active `apify_google_maps` and `yelp_apify` integration records even when both tokens happen to belong to the same Apify account
- Every Yelp run, job, usage event, health check, webhook, and source record references the Yelp integration connection ID rather than a generic or implicit Apify connection
- A uniqueness constraint prevents duplicate active Yelp integration records unless the existing architecture intentionally supports named multiple connections
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
- Create, test, rotate, and disconnect the separate Yelp-via-Apify connection without mutating the existing Apify connection
- Reject browser-supplied Yelp Actor IDs and bind the Yelp connection server-side to `memo23/yelp-scraper`

### Searches

- Create draft
- Estimate cost
- Confirm and enqueue
- Read run
- List runs
- Cancel run
- Retry failed stage
- Resume ingestion
- List Yelp-only runs for the dedicated Yelp Leads Scraper page

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

- Apify Actor callback
- Outscraper callback only if the existing implementation and current API use one
- Prospeo callback only if the existing implementation and current API use one
- Generic destination callback only when needed

An Apify callback must resolve and verify the exact expected connection and provider-job record. A Yelp callback may not fall back to the existing Google Maps Apify credential or connection when its Yelp connection reference is missing.

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
- Encrypt every Apify, Yelp-via-Apify, Outscraper, and Prospeo credential using the existing production envelope-encryption or approved managed-secret-store pattern
- Store the Yelp-via-Apify credential under a distinct secret reference; never alias it to or silently retrieve the existing Google Maps Apify secret reference
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
- Separate Yelp-via-Apify connect, test, rotate, disconnect, and health-state changes
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
- Source legal-enablement or Actor-approval change

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

## Google Maps, Yelp, Provider, and Actor Terms

Google Maps Platform terms restrict scraping, bulk storage, and certain uses of Google Maps content.

Using a third-party scraping provider does not automatically grant the platform unlimited downstream rights.

Yelp’s terms restrict automated scraping and data extraction except where expressly permitted. An Actor author’s availability or disclaimer is not a substitute for permission, legal review, or a valid contractual basis.

Before commercial launch:

- Obtain legal review for the intended countries and use cases
- Review Google, Yelp, Apify, Outscraper, Prospeo, and every approved Actor’s current terms and documentation
- Confirm data storage, export, and resale permissions
- Document attribution requirements
- Document retention requirements
- Create an acceptable-use policy
- Create a provider takedown and suspension process

Google Maps Platform terms:

https://cloud.google.com/maps-platform/terms

Yelp terms:

https://terms.yelp.com/tos/en_us/20260101_en_us/

Apify terms:

https://docs.apify.com/legal/terms-of-service

Outscraper terms and policies:

https://outscraper.com/terms-of-service/

Prospeo terms and policies:

https://prospeo.io/terms

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
- Yelp Leads Scraper
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

## Yelp Leads Scraper Page

Create a separate first-class page rather than a mode hidden inside Lead Finder.

Include:

- Page title: Yelp Leads Scraper
- Short explanation that Yelp searches run through the connected Apify Actor
- Separate Yelp-via-Apify connection badge
- Connect or test integration action when required
- Industry or search-term input
- Country, region, city, and postal-code inputs
- Maximum-results control
- Advanced options for full details, website contact email, reviews, and maximum reviews
- Actor and rate-card disclosure
- Low, expected, and high cost estimate
- Hard maximum cost confirmation
- Run button disabled until connection, capability, legal, quota, and confirmation gates pass
- Active run progress and cancellation state
- Recent Yelp searches
- Yelp-only leads table or a source-filtered view of the shared normalized leads table
- Add to list, export, and optional Prospeo-enrichment actions

The page must use the existing visual system, authorization, responsive layouts, normalized records, lists, exports, and usage ledger. It must not create a visually or technically disconnected mini-application.

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
- Simulates separate Yelp disconnected, connected, unhealthy, legal-disabled, running, partial, completed, and failed states without a real token

### Real Provider Smoke Mode

- Requires a test credential submitted specifically to the separate Yelp-via-Apify connection
- Requires explicit approval before a paid run
- Maximum 10 companies
- Very low maxTotalChargeUsd
- Runs the exact production adapter for the selected provider and source
- No reviews
- No images
- Decision-maker enrichment optional
- Records stored only in the development organization

Fixture mode is required for automated tests.

Existing Apify Google Maps, Outscraper, and Prospeo regression smoke tests must continue to pass. A separate real Apify smoke test is required for the new Yelp Actor before Yelp can be enabled in production, unless credentials, Actor access, legal approval, or commercial approval are unavailable. If unavailable, report Yelp as blocked rather than pretending it was tested.

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
- Yelp connection-selection logic never falls back to the existing Google Maps Apify connection
- Yelp navigation, entitlement, feature-flag, legal-gate, and disconnected-state policies

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
- Separate organization-scoped Yelp connection uniqueness and lifecycle
- Distinct secret references for Yelp and existing Apify connections
- Yelp disconnect preserves history and leaves every existing integration unchanged

## Provider and Apify Actor Contract Tests

- Apify authentication and connection mapping
- Separate Yelp-via-Apify authentication, Actor-access test, and sanitized health mapping
- Rejection when only the existing Google Maps Apify connection exists but the separate Yelp connection is missing
- Existing Google Maps Actor request and response regression coverage
- Yelp Actor request and response mapping
- Existing Outscraper request and response regression coverage
- Existing Prospeo request and response regression coverage
- Actor allowlist enforcement
- Approved Actor build and schema validation
- Actor capability mismatch handling
- Yelp URL builder and allowlist validation
- Yelp company-email labeling
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
- Apify Google Maps, Apify Yelp, Outscraper, and Prospeo rate-card selection
- Unknown or changed Actor pricing event

Use redacted fixtures committed to the repository.

## End-to-End Tests

- Sign up
- Create organization
- Confirm existing provider integrations remain present
- Open the dedicated Yelp Leads Scraper tab
- Connect the separate Yelp-via-Apify test integration
- Test the Yelp token and `memo23/yelp-scraper` access
- Create a Yelp search
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
- Rotate and disconnect the Yelp test credential without affecting the existing Apify, Outscraper, or Prospeo connections

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

## Phase 0: Production Baseline and Change Impact

- Read CLAUDE.md first if present
- Read AGENTS.md, README, package files, environment examples, migrations, and deployment configuration
- Inspect Git status
- Preserve user changes
- Identify the current production architecture and deployed commit
- Map the existing Apify, Outscraper, and Prospeo adapters and integration settings
- Trace the existing search, estimation, job, ingestion, normalization, deduplication, usage, export, and audit flows
- Run the current test and build baseline before changing code
- Record existing failures separately; do not disguise them as Yelp regressions
- Produce a concise change-impact map, compatibility risks, implementation plan, and rollback plan
- Record decisions in the repository’s existing project memory or architecture log

## Phase 1: Yelp Actor Contract and Feature Design

- Review the current `memo23/yelp-scraper` README, input schema, output schema, pricing, maintainer status, and terms
- Pin or record an approved Actor build when supported
- Define a server-controlled Yelp input schema and URL allowlist
- Define the Yelp output-to-existing-company-model mapping
- Define source namespace, provenance, deduplication, and null-field behavior
- Define a distinct `yelp_apify` integration type, encrypted secret reference, authorization policy, and connection lifecycle using repository conventions
- Define the dedicated Yelp Leads Scraper route, navigation state, and disconnected-state experience
- Add a versioned Yelp Actor capability and rate card
- Add separate feature, legal-enablement, and emergency-disable flags
- Create redacted Yelp fixtures and contract tests before live execution

## Phase 2: Additive Backend Integration

- Create a separate encrypted Yelp-via-Apify connection and credential flow
- Reuse only safe shared Apify client primitives; never fetch the existing Google Maps Apify secret as an implicit fallback
- Add the Yelp Actor adapter without changing working Google Maps behavior
- Add asynchronous start, callback or polling, pagination, checkpointing, cancellation, and idempotency using existing job abstractions
- Enforce result caps and `maxTotalChargeUsd`
- Add cost estimation and actual cost reconciliation
- Add additive database migrations only where the existing model lacks Yelp source fields
- Make every migration backward compatible with the currently deployed application during rollout

## Phase 3: Product and UI Integration

- Add a separate Yelp via Apify card to Integrations settings
- Add a dedicated Yelp Leads Scraper navigation tab and authenticated route
- Preserve Apify Google Maps, Outscraper, and Prospeo options and their current labels
- Keep the existing Lead Finder workflow unchanged and place Yelp-specific search fields on the dedicated Yelp page
- Show Actor, provider, cost, limits, and optional paid features before confirmation
- Add Yelp source badges, identifiers, and provenance to existing tables and detail views
- Preserve existing saved searches and URLs
- Add accessible loading, partial, empty, error, legal-disabled, and feature-disabled states

## Phase 4: Security, Legal, and Regression Validation

- Threat-model the new Actor inputs, callback flow, dataset ingestion, and website-email option
- Test arbitrary Actor execution denial, SSRF protections, webhook replay, schema drift, secret redaction, RLS, IDOR, and cross-tenant isolation
- Confirm Yelp legal approval is represented by a recorded gate, not a hardcoded assumption
- Run full regression tests for Apify Google Maps, Outscraper, Prospeo, searches, usage, exports, auth, organizations, and audit logs
- Verify no current provider credential or production data is changed
- Verify the Yelp credential cannot be read from or substituted by the existing Apify Google Maps connection without an explicit new Yelp connection submission

## Phase 5: Staging Release

- Deploy through the existing staging pipeline
- Apply and verify backward-compatible staging migrations
- Run fixture end to end
- Test Yelp connect, token/Actor health check, credential rotation, and Yelp-only disconnect behavior in staging
- After explicit approval, run a maximum-10-record real Yelp smoke test with a very low cost cap
- Reconcile actual cost and validate returned fields, nulls, pagination, deduplication, and audit records
- Run existing provider smoke or regression checks
- Test the Yelp kill switch and rollback procedure
- Confirm that hiding or disabling the Yelp tab and disconnecting Yelp do not affect any existing provider
- Capture evidence and blockers

## Phase 6: Controlled Production Rollout

- Prepare the exact release commit, migration order, environment changes, monitoring queries, rollback command, and owner approvals
- Keep Yelp disabled during deployment
- Deploy only after explicit production approval
- Run non-destructive health checks
- Enable Yelp for an internal or allowlisted organization first
- Monitor errors, cost variance, queue health, data quality, and existing-provider regressions
- Expand only after the observation window succeeds
- Disable Yelp immediately on schema drift, pricing drift, legal block, security concern, or material regression

Do not redo completed foundation work. Make the smallest well-tested production-safe change that satisfies the Yelp requirement.

---

# Immediate Enhancement Target

Build a working Yelp vertical slice inside the existing product where:

1. An authorized user sees a dedicated **Yelp Leads Scraper** navigation tab.
2. When disconnected, the Yelp page shows a safe **Connect Yelp via Apify** action without exposing or changing the existing Apify Google Maps connection.
3. An authorized admin creates the separate Yelp-via-Apify connection, submits an Apify token, and passes the token and `memo23/yelp-scraper` access test.
4. The Yelp connection stores its own encrypted secret reference, status, limits, and audit events.
5. The researcher opens the Yelp Leads Scraper tab, enters industry and location, and sets a bounded result count.
6. The platform maps the request to approved `memo23/yelp-scraper` input without accepting arbitrary Actor input or URLs.
7. The platform shows the Actor ID, estimated cost, optional paid features, and hard maximum cap.
8. The researcher confirms the run.
9. The existing job system queues and starts one idempotent Actor run using only the separate Yelp connection.
10. Fixture mode or the approved Actor returns Yelp businesses.
11. The worker ingests paginated results and preserves raw-source provenance and Yelp connection ID.
12. Companies are normalized and deduplicated against existing records without corrupting prior source data.
13. Yelp identifiers and URLs remain separate from Google Maps identifiers.
14. Optional Yelp website-email enrichment is off by default and any returned email is labeled as a company contact email.
15. Results appear on the Yelp page and in the existing review, list, export, usage, and audit flows.
16. Existing Apify Google Maps, Outscraper, and Prospeo workflows still pass regression tests.
17. Cross-tenant access remains denied.
18. Disconnecting or disabling Yelp stops new Yelp runs and the Yelp tab shows the correct state without affecting any existing provider.

Complete this vertical slice and staging gates before requesting production enablement.

---

# Claude Code Execution Rules

1. Read CLAUDE.md first when present.
2. Inspect the repository and Git status before editing.
3. Do not overwrite unrelated user changes.
4. Do not rebuild, replatform, or broadly refactor the working production project for this feature.
5. Use available official Claude Code skills, project skills, and focused subagents when they materially improve architecture, frontend quality, security review, testing, or DevOps.
6. Keep one execution owner responsible for integration consistency.
7. Maintain memory.md or the repository’s existing decision log.
8. Work in small, testable phases.
9. Implement the smallest complete Yelp vertical slice before optional breadth.
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
20. Do not claim the new Yelp integration is production-ready without a real low-cost staging smoke test or a clearly reported credential, legal, or commercial blocker.
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
- Enabling `memo23/yelp-scraper`, changing its approved production build, or expanding its rollout cohort

You may prepare code, migrations, commands, checklists, and deployment plans before approval.

---

# Required Documentation Deliverables

Update existing documentation where present. Create only the missing Yelp-specific or change-control documents needed by the repository:

- README.md only if setup or operator behavior changes
- CLAUDE.md or the existing execution guide only if repository instructions must change
- memory.md or the existing architecture decision log
- docs/YELP_APIFY_ACTOR.md
- docs/YELP_CONNECTION_AND_LEADS_TAB.md
- docs/PROVIDER_ADAPTERS.md
- docs/PROVIDER_PRICING_AND_COSTS.md
- docs/SECURITY.md or the existing security document
- docs/THREAT_MODEL.md or a Yelp-specific threat-model addendum
- docs/PRIVACY_AND_COMPLIANCE.md
- docs/TEST_PLAN.md
- docs/STAGING.md
- docs/DEPLOYMENT.md or the existing release runbook
- docs/ROLLBACK.md with the Yelp feature-flag rollback
- docs/OPERATIONS_RUNBOOK.md
- docs/RELEASE_CHECKLIST.md
- docs/KNOWN_LIMITATIONS.md
- .env.example only if a new non-secret variable is introduced

Documentation must match the actual implementation.

Do not document commands that were not verified.

---

# Deliverables

- Repository inspection and production change-impact report
- Separate Yelp-via-Apify integration card and encrypted credential lifecycle
- Approved `memo23/yelp-scraper` adapter using only the separate Yelp connection
- Yelp feature flag, legal-enablement flag, and emergency kill switch
- Admin-controlled Actor allowlist, approved build, schema version, and rate card
- Dedicated Yelp Leads Scraper navigation tab, route, search form, run progress, recent runs, and results view
- Yelp cost estimate, hard result cap, and `maxTotalChargeUsd`
- Durable, idempotent Yelp job execution, callback or polling, pagination, and recovery
- Normalized Yelp company records with separate Yelp identifiers and complete provenance
- Yelp-aware deduplication, review, lists, CSV, XLSX, usage, cost, and audit behavior
- Optional company-email enrichment disabled by default and labeled truthfully
- Additive migrations with compatibility and rollback verification when migrations are needed
- Redacted fixtures, unit tests, Actor contract tests, security tests, end-to-end tests, and regression tests
- Evidence that existing Apify Google Maps, Outscraper, and Prospeo flows remain working
- Updated documentation, staging checklist, controlled production rollout plan, monitoring plan, and rollback plan

---

# Definition of Done

The Yelp production enhancement is done only when all applicable requirements below are satisfied and the existing platform has no material regression.

## End-to-End Functional Flow

    Existing authorized organization
        → Open Yelp Leads Scraper tab
        → Connect Yelp via Apify separately
        → Test Yelp token and Actor access
        → Yelp feature and legal gates are enabled
        → Create industry and location search
        → See cost estimate
        → Confirm hard maximum cost
        → Queue run
        → Start memo23/yelp-scraper job
        → Receive or verify completion
        → Ingest paginated dataset
        → Normalize companies
        → Deduplicate companies
        → Optionally collect a public company contact email
        → Review company and contact records
        → Add selected records to a list
        → Export CSV or XLSX
        → Reconcile actual provider cost
        → Write audit trail

## Functional Completion

- All affected navigation routes work and existing routes remain unchanged unless intentionally documented.
- The Yelp Leads Scraper has a dedicated authenticated navigation item and route.
- The disconnected Yelp page routes authorized admins to the separate Yelp-via-Apify integration setup.
- The existing Lead Finder, Apify Google Maps, Outscraper, and Prospeo UI remains unchanged except for intentional shared-result provenance additions.
- The search form validates required fields.
- Country is required.
- Cost estimate is shown before a paid run.
- A hard provider cost cap is sent.
- Duplicate starts do not create duplicate paid jobs.
- Search progress survives page refresh.
- A worker restart can resume ingestion.
- Partial results remain usable.
- Provider failures show actionable errors.
- Company name, address, phone, website, and source identifiers are stored when returned.
- Google Maps place identifiers and Yelp business identifiers are stored in separate source namespaces.
- Company email is labeled as company email.
- A Yelp-returned owner candidate is sourced and labeled accurately; it is not automatically treated as a verified decision-maker.
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

## Provider and Yelp Actor Completion

- The separate Yelp-via-Apify connection test works with an authorized Apify key.
- The Yelp Actor-access test validates `memo23/yelp-scraper` independently from the existing Apify Google Maps connection.
- A maximum-10-record Yelp Actor smoke run works after explicit approval and legal enablement before Yelp is marked production-ready.
- The approved Yelp Actor build, input schema, output schema, and rate card are recorded.
- The real Yelp response schema is validated independently from the existing Google Maps schema.
- Dataset pagination works.
- Actual cost is reconciled.
- If Yelp website-email enrichment is enabled for an approved smoke test, the application accurately handles returned and missing fields and labels the result as a company contact email.
- Optional Yelp Actor capabilities remain disabled if not tested or if their price is not verified.
- Arbitrary non-allowlisted Actor execution is impossible from tenant-facing routes.
- Existing Apify Google Maps, Outscraper, and Prospeo automated regression tests pass.
- Existing live provider configurations are not renamed, deleted, or overwritten.
- Disconnecting or rotating the Yelp credential does not disconnect, rotate, or modify the existing Apify Google Maps credential.

## Security Completion

- No provider secret reaches the browser after storage.
- The Yelp secret reference is distinct from the existing Apify Google Maps secret reference, even if the user intentionally submits the same token value.
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
- The dedicated Yelp Leads Scraper tab and page work on desktop and mobile.
- Connected, disconnected, testing, unhealthy, legally disabled, and feature-disabled Yelp integration states are clear.
- No unintended horizontal page overflow.
- Tables have a deliberate mobile strategy.
- Cost confirmation is clear.
- Loading, empty, partial, success, and failure states exist.
- Keyboard navigation works.
- Color contrast and labels are accessible.

## Production Completion

- The existing staging and production topology is documented accurately.
- Production variables are documented.
- Migrations are reviewed.
- Migration lock duration and forward/backward compatibility are tested against production-like data volume.
- Backups are enabled.
- Monitoring is enabled.
- Health checks work.
- Deployment checklist is ready.
- Rollback checklist is ready.
- The release remains backward compatible during deployment.
- Yelp is deployed disabled by default and enabled only after approval.
- The Yelp kill switch is tested without interrupting Apify Google Maps, Outscraper, or Prospeo.
- Rollout abort thresholds and the observation window are documented.
- Existing-provider error rate, latency, cost accounting, and data quality remain within the agreed baseline.
- Real production deployment and rollout occur only after approval.
- Post-deployment smoke tests are documented and executed when deployment is approved.

## Commercial and Legal Completion

- Provider terms have been reviewed for the intended use.
- Google Maps, Yelp, Apify, Outscraper, Prospeo, and approved Actor terms have been reviewed as applicable to the intended use.
- Yelp remains disabled until its specific legal and terms-review gate is recorded.
- Direct LinkedIn scraping is not implemented.
- Acceptable-use and privacy requirements are documented.
- Retention and deletion workflows work.
- No unsupported claim of legal compliance is made.

Do not call the Yelp enhancement finished if only the UI works.

Do not call the Yelp enhancement production-ready if only fixture mode works and the report hides the missing real-Actor test.

Do not call the Yelp enhancement finished if secrets, RLS, cost caps, exports, job recovery, regression testing, or rollback controls are incomplete.

---

# Final Reporting Format

When the work is complete, provide:

## 1. Inspection Summary

- Existing production repository and deployed baseline
- Framework
- Architecture
- Database
- Auth
- Deployment
- Existing Apify Google Maps, Outscraper, and Prospeo functionality preserved
- Risks found

## 2. Architecture Implemented

- Web application
- Worker
- Database
- Provider adapters
- Job state machine
- Security boundaries

## 3. Yelp Enhancement Completed

- Separate Yelp-via-Apify integration and encrypted credential lifecycle
- Dedicated Yelp Leads Scraper navigation tab and page
- `memo23/yelp-scraper` adapter and approved contract
- Cost estimation and hard caps
- Provider job, ingestion, and normalization
- Yelp provenance and deduplication
- Existing review, lists, and exports integration
- Usage and audit logs
- Feature flag, legal gate, monitoring, and rollback
- Existing-provider regression status

## 4. Yelp Actor Validation

- Actor ID and approved build
- Account plan
- Test method
- Records requested
- Records returned
- Actual cost
- Missing fields
- Rate limits
- Remaining Yelp, Apify, legal, pricing, or Actor blockers

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
- Separate Yelp-via-Apify token configuration
- Yelp Actor access or source legal approval
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
- Feature-flag rollout cohort and observation window

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
3. Treat the repository as an existing production application and identify the deployed baseline.
4. Map the current Apify, Outscraper, and Prospeo integrations before changing code.
5. Identify the safest existing extension point for a separate Yelp-via-Apify connection, secret reference, integration card, navigation tab, and route.
6. Compare the current code with this Yelp enhancement prompt.
7. Run and record the existing test and build baseline.
8. Produce a concise inspection and change-impact summary.
9. Produce a production-safe implementation and rollback plan.
10. Record assumptions and blockers.
11. Begin the local additive implementation immediately unless a real credential, commercial-use decision, destructive action, or external action requires approval.

You are the principal engineer and execution owner.

Build the Yelp vertical slice inside the existing platform.

Test it.

Secure it.

Document it.

Prepare a controlled staging validation and production rollout without disturbing existing provider integrations.
