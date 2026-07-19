'use client';

import { useMemo, useState } from 'react';
import {
  APPROVED_YELP_ACTOR_ID,
  estimateYelpRunCost,
  type RateCard,
} from '@leadfinder/core';
import { createYelpDraftAndEstimate } from '@/actions/yelp';
import { Button, Card, CardHeader, Field, Input, Money, Select } from '@/components/ui';

/**
 * Yelp search form with the same live cost-preview panel as the Lead Finder:
 * the estimate recomputes on every keystroke from the versioned rate card.
 * The server recomputes the authoritative estimate at draft time and the hard
 * cap is confirmed on the next screen — nothing here charges anything.
 */
export function YelpSearchBuilder({
  connectionId,
  connectionLabel,
  rateCard,
  maxResultsLimit,
  remainingBudgetMicroUsd,
  perRunCapMicroUsd,
  defaultCountry,
  legalOn,
}: {
  connectionId: string;
  connectionLabel: string;
  rateCard: RateCard;
  maxResultsLimit: number;
  remainingBudgetMicroUsd: number | null;
  perRunCapMicroUsd: number | null;
  defaultCountry: string;
  legalOn: boolean;
}) {
  const [name, setName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [country, setCountry] = useState(defaultCountry);
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [maxResults, setMaxResults] = useState(Math.min(100, maxResultsLimit));
  const [fetchDetails, setFetchDetails] = useState(true);
  const [scrapeReviews, setScrapeReviews] = useState(false);
  const [maxReviews, setMaxReviews] = useState(10);

  const hasLocation = Boolean(city.trim() || region.trim() || postalCode.trim());
  const ready = Boolean(searchTerm.trim() && country.trim() && hasLocation && maxResults >= 1);

  const estimate = useMemo(() => {
    if (!ready) return null;
    try {
      return estimateYelpRunCost(
        {
          maxResults: Math.max(1, maxResults),
          scrapeReviews,
          maxReviewsPerBusiness: maxReviews,
        },
        rateCard,
      );
    } catch {
      return null;
    }
  }, [ready, maxResults, scrapeReviews, maxReviews, rateCard]);

  const overBudget =
    estimate !== null &&
    remainingBudgetMicroUsd !== null &&
    estimate.totalHigh > remainingBudgetMicroUsd;

  const checkbox = 'size-4 rounded border-line-strong accent-[#2f4f7d]';

  return (
    <form action={createYelpDraftAndEstimate} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <input type="hidden" name="connectionId" value={connectionId} />

      <div className="space-y-6">
        <Card className="rise rise-1">
          <CardHeader overline="Step 1 · Search" title="What are you looking for on Yelp?" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field
              label="Industry or search term"
              htmlFor="yb-term"
              hint='e.g. "plumber", "coffee shop", "wedding photographer"'
            >
              <Input
                id="yb-term"
                name="searchTerm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                required
                maxLength={200}
              />
            </Field>
            <Field label="Search name" htmlFor="yb-name" hint="Defaults to the search term">
              <Input
                id="yb-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
              />
            </Field>
            <Field label="Country" htmlFor="yb-country">
              <Select
                id="yb-country"
                name="countryCode"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
                <option value="IE">Ireland</option>
                <option value="NZ">New Zealand</option>
              </Select>
            </Field>
            <Field label="City" htmlFor="yb-city">
              <Input
                id="yb-city"
                name="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={120}
              />
            </Field>
            <Field label="State / region" htmlFor="yb-region">
              <Input
                id="yb-region"
                name="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                maxLength={120}
              />
            </Field>
            <Field label="Postal / ZIP code" htmlFor="yb-postal" hint="Optional">
              <Input
                id="yb-postal"
                name="postalCode"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                maxLength={20}
              />
            </Field>
            <Field
              label="Maximum results"
              htmlFor="yb-max"
              hint={`Caps the paid item count. Workspace limit: ${maxResultsLimit}`}
            >
              <Input
                id="yb-max"
                name="maxResults"
                type="text"
                inputMode="numeric"
                value={maxResults === 0 ? '' : String(maxResults)}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  setMaxResults(digits === '' ? 0 : Number(digits));
                }}
                onBlur={() =>
                  setMaxResults((v) => Math.min(maxResultsLimit, Math.max(1, v || 1)))
                }
                className="money"
                required
              />
            </Field>
          </div>
        </Card>

        <Card className="rise rise-2">
          <details>
            <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-primary select-none">
              Advanced Yelp options
            </summary>
            <div className="space-y-3 border-t border-line px-5 py-4 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="fetchBusinessDetails"
                  checked={fetchDetails}
                  onChange={(e) => setFetchDetails(e.target.checked)}
                  className={checkbox}
                />
                <span>
                  Fetch full business details
                  <span className="block text-xs text-ink-faint">
                    Visits each profile for hours, website, and services. Recommended.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="scrapeReviews"
                  checked={scrapeReviews}
                  onChange={(e) => setScrapeReviews(e.target.checked)}
                  className={checkbox}
                />
                <span>
                  Collect reviews
                  <span className="block text-xs text-ink-faint">
                    Adds review-detail charges per review — see the cost panel update.
                  </span>
                </span>
              </label>
              {scrapeReviews ? (
                <Field
                  label="Max reviews per business"
                  htmlFor="yb-max-reviews"
                  hint="Each review is billed — keep this small"
                >
                  <Input
                    id="yb-max-reviews"
                    name="maxReviewsPerBusiness"
                    type="text"
                    inputMode="numeric"
                    value={String(maxReviews)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setMaxReviews(digits === '' ? 1 : Math.min(100, Number(digits)));
                    }}
                    className="money w-28"
                  />
                </Field>
              ) : (
                <input type="hidden" name="maxReviewsPerBusiness" value={maxReviews} />
              )}
              <label className="flex items-start gap-2 opacity-60">
                <input type="checkbox" disabled className={checkbox} />
                <span>
                  Website contact-email enrichment
                  <span className="block text-xs text-ink-faint">
                    Disabled: the Actor&apos;s email-enrichment event has no published price, so it
                    cannot be estimated honestly.
                  </span>
                </span>
              </label>
            </div>
          </details>
        </Card>
      </div>

      {/* Cost & quota panel — same instrument as the Lead Finder. */}
      <div className="space-y-4">
        <Card className="rise rise-2 lg:sticky lg:top-20">
          <CardHeader overline="Step 2 · Estimate" title="Cost preview" />
          <div className="space-y-3 p-5 text-sm">
            <p className="text-xs text-ink-faint">
              Connection: <span className="font-medium text-ink-soft">{connectionLabel}</span> ·
              Actor <code className="mono">{APPROVED_YELP_ACTOR_ID}</code> · prices verified{' '}
              {rateCard.lastVerifiedAt}
            </p>
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
                  Estimated businesses: ~{estimate.estimatedCompanies.expected.toLocaleString()}.
                  Yelp availability varies by area; actual results may be lower.
                </p>
                <div className="rounded-md bg-primary-soft px-3 py-2">
                  <p className="text-xs text-primary">
                    Suggested hard cap (you confirm it next step; Apify minimum $0.50)
                  </p>
                  <p className="font-semibold text-primary">
                    <Money micro={Math.max(estimate.recommendedCapMicroUsd, 500_000)} />
                  </p>
                </div>
              </>
            ) : (
              <p className="text-ink-faint">
                Enter a search term and a city, region, or postal code to see the estimate.
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
            <Button type="submit" className="w-full" disabled={!ready || !legalOn || overBudget}>
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
