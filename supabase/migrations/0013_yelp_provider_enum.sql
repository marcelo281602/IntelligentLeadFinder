-- Separate Yelp-via-Apify integration (LEAD_FINDER_SAAS_YELP_MASTER_PROMPT).
-- New provider_kind value only. Postgres forbids USING a new enum value in
-- the same transaction that adds it, and each migration runs in its own
-- transaction — so the value is added here and first used in 0014.
-- 'yelp_apify' is a distinct integration identity: its own connections,
-- encrypted secret references, rate cards, runs, and usage rows. It never
-- shares or falls back to the existing 'apify' Google Maps connection.

alter type public.provider_kind add value if not exists 'yelp_apify';
