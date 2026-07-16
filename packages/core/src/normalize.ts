/**
 * Normalizers for URLs, domains, emails, phones, and company names.
 * Deterministic and side-effect free; used by ingestion, dedupe, and tests.
 */

const TRACKING_PARAM_PATTERN = /^(utm_|fbclid|gclid|msclkid|mc_eid|ref$)/i;

/** Canonicalize a URL: force protocol, lowercase host, strip tracking/fragment. */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';
  const toDelete: string[] = [];
  url.searchParams.forEach((_v, key) => {
    if (TRACKING_PARAM_PATTERN.test(key)) toDelete.push(key);
  });
  for (const key of toDelete) url.searchParams.delete(key);
  let out = url.toString();
  if (out.endsWith('/') && url.pathname === '/' && !url.search) out = out.slice(0, -1);
  return out;
}

/** Common multi-part public suffixes (pragmatic subset; documented limitation). */
const TWO_PART_TLDS = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'net.nz',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp',
  'com.br', 'net.br', 'org.br',
  'com.mx', 'org.mx',
  'co.in', 'net.in', 'org.in', 'ac.in',
  'com.sg', 'com.my', 'com.hk', 'com.tw', 'com.cn', 'net.cn', 'org.cn',
  'co.za', 'org.za', 'co.kr', 'or.kr',
  'com.ar', 'com.co', 'com.pe', 'com.ph', 'com.pk', 'com.tr', 'com.ua',
  'co.il', 'org.il', 'com.eg', 'com.sa', 'com.ng', 'co.ke',
]);

/** Extract the registrable root domain from a URL or hostname. */
export function rootDomain(rawUrlOrHost: string): string | null {
  let host: string;
  const normalized = normalizeUrl(rawUrlOrHost);
  if (normalized) {
    try {
      host = new URL(normalized).hostname;
    } catch {
      return null;
    }
  } else {
    host = rawUrlOrHost.trim().toLowerCase();
  }
  host = host.replace(/^www\./, '');
  if (!host.includes('.')) return null;
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join('.');
  if (TWO_PART_TLDS.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

const EMAIL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Lowercase, trim, and validate an email. Returns null when invalid. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254) return null;
  return EMAIL_PATTERN.test(email) ? email : null;
}

/** ISO-3166 alpha-2 → international dial code (best-effort static map). */
const DIAL_CODES: Record<string, string> = {
  US: '1', CA: '1', GB: '44', IE: '353', AU: '61', NZ: '64',
  DE: '49', FR: '33', ES: '34', PT: '351', IT: '39', NL: '31', BE: '32', LU: '352',
  CH: '41', AT: '43', DK: '45', SE: '46', NO: '47', FI: '358', IS: '354',
  PL: '48', CZ: '420', SK: '421', HU: '36', RO: '40', BG: '359', GR: '30',
  HR: '385', SI: '386', RS: '381', UA: '380', EE: '372', LV: '371', LT: '370',
  MX: '52', BR: '55', AR: '54', CL: '56', CO: '57', PE: '51', VE: '58',
  EC: '593', UY: '598', PY: '595', BO: '591', CR: '506', PA: '507', GT: '502',
  DO: '1', PR: '1', JM: '1', TT: '1',
  JP: '81', KR: '82', CN: '86', HK: '852', TW: '886', SG: '65', MY: '60',
  TH: '66', VN: '84', PH: '63', ID: '62', IN: '91', PK: '92', BD: '880', LK: '94',
  AE: '971', SA: '966', QA: '974', KW: '965', BH: '973', OM: '968',
  IL: '972', TR: '90', EG: '20', MA: '212', TN: '216', DZ: '213',
  ZA: '27', NG: '234', KE: '254', GH: '233', TZ: '255', UG: '256', ET: '251',
  RU: '7', KZ: '7', GE: '995', AM: '374', AZ: '994',
};

export interface NormalizedPhone {
  /** E.164 (+15551234567) when confidently derivable, otherwise null. */
  e164: string | null;
  /** Digits-only fallback, always present when input had digits. */
  digits: string;
}

/**
 * Best-effort E.164 normalization. Never fabricates a country: when the
 * number has no international prefix and no country hint, e164 stays null.
 */
export function normalizePhone(raw: string, countryCode?: string | null): NormalizedPhone {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return { e164: null, digits: '' };

  // "00" international prefix → treat as "+"
  if (!hasPlus && digits.startsWith('00')) {
    digits = digits.slice(2);
    return finalizeE164(digits);
  }
  if (hasPlus) return finalizeE164(digits);

  const dial = countryCode ? DIAL_CODES[countryCode.toUpperCase()] : undefined;
  if (dial) {
    // Strip one national trunk "0" prefix where customary.
    const national = digits.startsWith('0') && dial !== '1' ? digits.slice(1) : digits;
    // NANP numbers may already include the leading 1.
    const candidate =
      dial === '1' && national.length === 11 && national.startsWith('1')
        ? national
        : `${dial}${national}`;
    return finalizeE164(candidate);
  }
  return { e164: null, digits };
}

function finalizeE164(digits: string): NormalizedPhone {
  if (digits.length < 7 || digits.length > 15) return { e164: null, digits };
  return { e164: `+${digits}`, digits };
}

const LEGAL_SUFFIXES =
  /\b(llc|l\.l\.c\.|inc|inc\.|incorporated|ltd|ltd\.|limited|llp|plc|gmbh|ag|s\.a\.|sa|srl|s\.r\.l\.|bv|b\.v\.|pty|pty\.|corp|corp\.|corporation|co|co\.|company|kg|oy|ab|as|aps|sp\. z o\.o\.|sarl|s\.a\.r\.l\.)\b\.?$/i;

/** Normalize a company name for dedupe: lowercase, strip punctuation & legal suffixes. */
export function normalizeCompanyName(raw: string): string {
  let name = raw.toLowerCase().trim();
  name = name.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  name = name.replace(/&/g, ' and ');
  name = name.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  name = name.replace(/\s+/g, ' ').trim();
  const withoutSuffix = name.replace(LEGAL_SUFFIXES, '').trim();
  return withoutSuffix || name;
}

/** Normalize an address line for dedupe keys. */
export function normalizeAddress(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a LinkedIn URL to its canonical profile/company path. */
export function normalizeLinkedInUrl(raw: string): {
  url: string;
  kind: 'personal' | 'company' | 'unknown';
} | null {
  const normalized = normalizeUrl(raw);
  if (!normalized) return null;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null;
  const path = url.pathname.replace(/\/+$/, '');
  const canonical = `https://www.linkedin.com${path}`;
  if (/^\/in\//.test(path)) return { url: canonical, kind: 'personal' };
  if (/^\/(company|school|showcase)\//.test(path)) return { url: canonical, kind: 'company' };
  return { url: canonical, kind: 'unknown' };
}
