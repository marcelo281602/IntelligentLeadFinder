/**
 * Centralized brand configuration.
 *
 * Every user-facing occurrence of the product name, logo, colors, support
 * links, and email identity must come from this object so the brand can be
 * changed in one place without searching the codebase.
 */
export interface BrandConfig {
  /** Product display name. */
  name: string;
  /** Short name for compact UI (sidebar, favicon alt). */
  shortName: string;
  /** One-line product description used in metadata. */
  tagline: string;
  /** Legal entity name for footers and policy pages. */
  legalName: string;
  /** Support email shown in the UI. */
  supportEmail: string;
  /** Sender identity for transactional email (when email is enabled). */
  emailFrom: string;
  /** Documentation base URL. */
  docsUrl: string;
  /** Brand palette. Deep desaturated blue primary, cyan accent. */
  colors: {
    primary: string;
    primaryHover: string;
    accent: string;
    ink: string;
  };
}

export const brand: BrandConfig = {
  name: 'LeadFinder',
  shortName: 'LeadFinder',
  tagline: 'Lead intelligence and decision-maker scraper for growing teams',
  legalName: 'LeadFinder (working brand)',
  supportEmail: 'support@example.com',
  emailFrom: 'LeadFinder <no-reply@example.com>',
  docsUrl: '/docs',
  colors: {
    primary: '#2f4f7d',
    primaryHover: '#263f64',
    accent: '#3ba7c4',
    ink: '#232a33',
  },
};
