'use client';

import { useMemo, useState } from 'react';
import {
  countBillableFilters,
  DEFAULT_DECISION_MAKER_TITLES,
  estimateRunCost,
  searchConfigSchema,
  type RateCard,
} from '@leadfinder/core';
import { createDraftAndEstimate } from '@/actions/search';
import { Button, Card, CardHeader, Field, Input, Money, Select, cx } from '@/components/ui';

interface ConnectionOption {
  id: string;
  provider: string;
  label: string;
  planTier: string;
  rateCard: RateCard;
}

interface Props {
  connections: ConnectionOption[];
  maxResultsLimit: number;
  remainingBudgetMicroUsd: number | null;
  perRunCapMicroUsd: number | null;
  defaultCountry: string;
}

/**
 * Search builder with progressive disclosure and a live cost preview.
 * The preview uses the same estimator the server runs; the server recomputes
 * authoritatively before anything is paid.
 */
export function SearchBuilder({
  connections,
  maxResultsLimit,
  remainingBudgetMicroUsd,
  perRunCapMicroUsd,
  defaultCountry,
}: Props) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');
  const [name, setName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [country, setCountry] = useState(defaultCountry);
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [maxResults, setMaxResults] = useState(100);
  const [minRating, setMinRating] = useState('');
  const [requireWebsite, setRequireWebsite] = useState(false);
  const [requirePhone, setRequirePhone] = useState(false);
  const [requireEmail, setRequireEmail] = useState(false);
  const [excludeClosed, setExcludeClosed] = useState(true);
  const [includeCategories, setIncludeCategories] = useState('');
  const [excludeKeywords, setExcludeKeywords] = useState('');
  const [companyContacts, setCompanyContacts] = useState(false);
  const [dmEnabled, setDmEnabled] = useState(false);
  const [dmMax, setDmMax] = useState(1);
  const [dmTitles, setDmTitles] = useState(DEFAULT_DECISION_MAKER_TITLES.join(', '));
  const [dmVerify, setDmVerify] = useState(false);
  const [dmPhone, setDmPhone] = useState(false);

  const connection = connections.find((c) => c.id === connectionId) ?? connections[0];

  const config = useMemo(() => {
    const candidate = {
      name: name || searchTerm || 'Untitled search',
      searchTerm,
      maxResults,
      language: 'en',
      locations: [
        {
          countryCode: (country || 'US').toUpperCase().slice(0, 2),
          region: region || undefined,
          city: city || undefined,
          postalCode: postalCode || undefined,
        },
      ],
      filters: {
        minRating: minRating ? Number(minRating) : undefined,
        requireWebsite,
        requirePhone,
        requireCompanyEmail: requireEmail,
        excludeTemporarilyClosed: excludeClosed,
        excludePermanentlyClosed: excludeClosed,
        includeCategories: includeCategories
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 25),
        excludeKeywords: excludeKeywords
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 25),
      },
      includeCompanyContacts: companyContacts,
      decisionMakers: {
        enabled: dmEnabled,
        maxContactsPerCompany: dmMax,
        targetTitles: dmTitles
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 30),
        verifyWorkEmail: dmEnabled && dmVerify,
        requestPhone: dmEnabled && dmPhone,
      },
    };
    const parsed = searchConfigSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }, [
    name,
    searchTerm,
    maxResults,
    country,
    region,
    city,
    postalCode,
    minRating,
    requireWebsite,
    requirePhone,
    requireEmail,
    excludeClosed,
    includeCategories,
    excludeKeywords,
    companyContacts,
    dmEnabled,
    dmMax,
    dmTitles,
    dmVerify,
    dmPhone,
  ]);

  const estimate = useMemo(() => {
    if (!config || !connection) return null;
    try {
      return estimateRunCost(
        {
          maxResults: config.maxResults,
          billableFilterCount: countBillableFilters(config.filters),
          includePlaceDetails: config.includePlaceDetails,
          includeCompanyContacts: config.includeCompanyContacts,
          decisionMakers: {
            enabled: config.decisionMakers.enabled,
            maxContactsPerCompany: config.decisionMakers.maxContactsPerCompany,
            verifyEmails: config.decisionMakers.verifyWorkEmail,
            enrichSocialProfiles: config.decisionMakers.enrichSocialProfiles,
          },
          reviewsPerPlace: 0,
          imagesPerPlace: 0,
        },
        connection.rateCard,
      );
    } catch {
      return null;
    }
  }, [config, connection]);

  const overBudget =
    estimate !== null &&
    remainingBudgetMicroUsd !== null &&
    connection?.provider !== 'fixture' &&
    estimate.totalHigh > remainingBudgetMicroUsd;

  const checkbox = 'size-4 rounded border-line-strong accent-[#2f4f7d]';

  return (
    <form action={createDraftAndEstimate} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <input type="hidden" name="config" value={config ? JSON.stringify(config) : ''} />
      <input type="hidden" name="connectionId" value={connectionId} />

      <div className="space-y-6">
        {/* Required fields */}
        <Card className="rise rise-1">
          <CardHeader overline="Step 1 · Search" title="What are you looking for?" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Search name" htmlFor="sb-name" hint="For your team's reference">
              <Input
                id="sb-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Plumbers — Austin Q3"
              />
            </Field>
            <Field label="Industry or search term" htmlFor="sb-term">
              <Input
                id="sb-term"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="plumber, dental clinic, coffee roaster…"
                required
              />
            </Field>
            <Field label="Country (ISO-2)" htmlFor="sb-country">
              <Input
                id="sb-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                maxLength={2}
                required
              />
            </Field>
            <Field
              label="Max companies"
              htmlFor="sb-max"
              hint={`Workspace limit: ${maxResultsLimit}`}
            >
              <Input
                id="sb-max"
                type="number"
                min={1}
                max={maxResultsLimit}
                value={maxResults}
                onChange={(e) => setMaxResults(Math.max(1, Number(e.target.value) || 1))}
                className="money"
              />
            </Field>
            <Field label="State / region" htmlFor="sb-region" hint="Optional">
              <Input id="sb-region" value={region} onChange={(e) => setRegion(e.target.value)} />
            </Field>
            <Field label="City" htmlFor="sb-city" hint="Optional">
              <Input id="sb-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field
              label="Postal code"
              htmlFor="sb-postal"
              hint="Use with country only — not with city"
            >
              <Input
                id="sb-postal"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                disabled={Boolean(city)}
              />
            </Field>
          </div>
        </Card>

        {/* Advanced filters */}
        <Card className="rise rise-2">
          <details>
            <summary className="cursor-pointer px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
              <span className="overline">Optional</span>
              <span className="mt-0.5 block text-base font-semibold">Business filters</span>
              <span className="text-xs text-ink-faint">
                Star rating, website and closed-place filters are billed by the provider (
                {config ? countBillableFilters(config.filters) : 0} active). Phone, email
                and review-count filters are applied for free after collection.
              </span>
            </summary>
            <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2">
              <Field label="Minimum rating" htmlFor="sb-rating">
                <Select
                  id="sb-rating"
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                >
                  <option value="">Any rating</option>
                  <option value="3">3.0+</option>
                  <option value="3.5">3.5+</option>
                  <option value="4">4.0+</option>
                  <option value="4.5">4.5+</option>
                </Select>
              </Field>
              <Field label="Include categories" htmlFor="sb-cats" hint="Comma-separated">
                <Input
                  id="sb-cats"
                  value={includeCategories}
                  onChange={(e) => setIncludeCategories(e.target.value)}
                  placeholder="Plumber, Contractor"
                />
              </Field>
              <Field
                label="Exclude keywords"
                htmlFor="sb-exkw"
                hint="Skip companies matching these"
              >
                <Input
                  id="sb-exkw"
                  value={excludeKeywords}
                  onChange={(e) => setExcludeKeywords(e.target.value)}
                  placeholder="franchise, supply"
                />
              </Field>
              <fieldset className="space-y-2 text-sm">
                <legend className="mb-1 text-sm font-medium">Requirements</legend>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className={checkbox}
                    checked={requireWebsite}
                    onChange={(e) => setRequireWebsite(e.target.checked)}
                  />
                  Has website <span className="text-xs text-ink-faint">(billed filter)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className={checkbox}
                    checked={requirePhone}
                    onChange={(e) => setRequirePhone(e.target.checked)}
                  />
                  Has phone <span className="text-xs text-ink-faint">(free post-filter)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className={checkbox}
                    checked={requireEmail}
                    onChange={(e) => setRequireEmail(e.target.checked)}
                  />
                  Has company email{' '}
                  <span className="text-xs text-ink-faint">(free post-filter)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className={checkbox}
                    checked={excludeClosed}
                    onChange={(e) => setExcludeClosed(e.target.checked)}
                  />
                  Exclude closed places{' '}
                  <span className="text-xs text-ink-faint">(billed filter)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className={checkbox}
                    checked={companyContacts}
                    onChange={(e) => setCompanyContacts(e.target.checked)}
                  />
                  Company contact enrichment
                  <span className="text-xs text-ink-faint">
                    (emails &amp; socials from websites — billed)
                  </span>
                </label>
              </fieldset>
            </div>
          </details>
        </Card>

        {/* Decision-maker enrichment */}
        <Card className="rise rise-3">
          <details open={dmEnabled}>
            <summary className="cursor-pointer px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
              <span className="overline">Optional · billed per successful lead</span>
              <span className="mt-0.5 block text-base font-semibold">Decision-maker discovery</span>
              <span className="text-xs text-ink-faint">
                Names, titles, work emails, phones and LinkedIn profiles from the provider&apos;s
                licensed lead data. Off by default — no surprise charges.
              </span>
            </summary>
            <div className="space-y-4 border-t border-line p-5">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className={checkbox}
                  checked={dmEnabled}
                  onChange={(e) => setDmEnabled(e.target.checked)}
                />
                Find decision-makers for each company
              </label>
              <div
                className={cx(
                  'grid gap-4 sm:grid-cols-2',
                  !dmEnabled && 'pointer-events-none opacity-40',
                )}
              >
                <Field
                  label="Max contacts per company"
                  htmlFor="sb-dm-max"
                  hint="Keep at 1 for the low-cost preset"
                >
                  <Select
                    id="sb-dm-max"
                    value={String(dmMax)}
                    onChange={(e) => setDmMax(Number(e.target.value))}
                  >
                    {[1, 2, 3, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="space-y-2 pt-1 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className={checkbox}
                      checked={dmVerify}
                      onChange={(e) => setDmVerify(e.target.checked)}
                    />
                    Verify work emails{' '}
                    <span className="text-xs text-ink-faint">(billed per decisive check)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className={checkbox}
                      checked={dmPhone}
                      onChange={(e) => setDmPhone(e.target.checked)}
                    />
                    Request mobile / direct phone
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <Field
                    label="Target job titles"
                    htmlFor="sb-dm-titles"
                    hint="Editable presets, comma-separated"
                  >
                    <textarea
                      id="sb-dm-titles"
                      value={dmTitles}
                      onChange={(e) => setDmTitles(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
                    />
                  </Field>
                </div>
              </div>
            </div>
          </details>
        </Card>
      </div>

      {/* Cost & quota panel */}
      <div className="space-y-4">
        <Card className="rise rise-2 lg:sticky lg:top-20">
          <CardHeader overline="Step 2 · Estimate" title="Cost preview" />
          <div className="space-y-3 p-5 text-sm">
            <Field label="Data provider" htmlFor="sb-conn">
              <Select
                id="sb-conn"
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.provider === 'fixture' ? '🧪 ' : ''}
                    {c.label} ({c.provider} · {c.planTier})
                  </option>
                ))}
              </Select>
            </Field>
            {connection?.provider === 'fixture' ? (
              <p className="rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
                Fixture provider: free deterministic <strong>test data</strong>, clearly flagged —
                ideal for trying the full workflow.
              </p>
            ) : null}
            {estimate ? (
              <>
                <ul className="divide-y divide-line border-y border-line">
                  {estimate.lines.map((line) => (
                    <li
                      key={line.eventKey}
                      className="flex items-baseline justify-between gap-2 py-1.5"
                    >
                      <span className="text-ink-soft">
                        {line.label}
                        <span className="ml-1 text-xs text-ink-faint">
                          ×{line.expectedUnits.toLocaleString()}
                        </span>
                      </span>
                      <Money micro={line.expected} className="text-xs" />
                    </li>
                  ))}
                </ul>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">Low</dt>
                    <dd>
                      <Money micro={estimate.totalLow} />
                    </dd>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <dt>Expected</dt>
                    <dd>
                      <Money micro={estimate.totalExpected} />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">High</dt>
                    <dd>
                      <Money micro={estimate.totalHigh} />
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-ink-faint">
                  Estimated companies: ~{estimate.estimatedCompanies.expected.toLocaleString()}
                  {dmEnabled
                    ? ` · contacts: ~${estimate.estimatedContacts.expected.toLocaleString()}`
                    : ''}
                  . Enrichment charges depend on real outcomes; actual available records may be
                  lower.
                </p>
                <div className="rounded-md bg-primary-soft px-3 py-2">
                  <p className="text-xs text-primary">
                    Suggested hard cap (you confirm it next step)
                  </p>
                  <p className="font-semibold text-primary">
                    <Money micro={estimate.recommendedCapMicroUsd} />
                  </p>
                </div>
              </>
            ) : (
              <p className="text-ink-faint">
                Enter a search term and location to see the estimate.
              </p>
            )}
            <div className="space-y-1 border-t border-line pt-3 text-xs text-ink-soft">
              <div className="flex justify-between">
                <span>Remaining monthly budget</span>
                <Money micro={remainingBudgetMicroUsd} />
              </div>
              <div className="flex justify-between">
                <span>Per-run cap limit</span>
                <Money micro={perRunCapMicroUsd} />
              </div>
            </div>
            {overBudget ? (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                The high estimate exceeds your remaining monthly budget. Lower the result count or
                raise the budget in Settings.
              </p>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={!config || !connection || overBudget}
            >
              Review &amp; confirm run
            </Button>
            <p className="text-center text-xs text-ink-faint">
              Nothing runs or gets charged until you confirm the hard cost cap.
            </p>
          </div>
        </Card>
      </div>
    </form>
  );
}
