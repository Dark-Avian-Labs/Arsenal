function readTrimmedEnv(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export const APP_DISPLAY_NAME = readTrimmedEnv(
  import.meta.env.VITE_APP_NAME as string | undefined,
  'Sentinel',
);

export const APP_VERSION = readTrimmedEnv(
  import.meta.env.VITE_APP_VERSION as string | undefined,
  'dev',
);

export const LEGAL_ENTITY_NAME = readTrimmedEnv(
  import.meta.env.VITE_LEGAL_ENTITY_NAME as string | undefined,
  'Dark Avian Labs',
);

export const SEARCH_PLACEHOLDER = readTrimmedEnv(
  import.meta.env.VITE_SEARCH_PLACEHOLDER as string | undefined,
  'Search...',
);

export const CLERK_PUBLISHABLE_KEY = readTrimmedEnv(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined,
  '',
);

export const CLERK_ENABLED = CLERK_PUBLISHABLE_KEY.length > 0;

export const APP_ID = readTrimmedEnv(
  import.meta.env.VITE_APP_ID as string | undefined,
  'sentinel',
).toLowerCase();

const DEFAULT_LEGAL_PAGE_URL = 'https://darkavianlabs.com/legal';

function isSafeLegalUrl(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\') && !url.includes('://')) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const resolvedLegalPageUrl = readTrimmedEnv(
  import.meta.env.VITE_LEGAL_PAGE_URL as string | undefined,
  DEFAULT_LEGAL_PAGE_URL,
);

export const LEGAL_PAGE_URL = isSafeLegalUrl(resolvedLegalPageUrl)
  ? resolvedLegalPageUrl
  : DEFAULT_LEGAL_PAGE_URL;
