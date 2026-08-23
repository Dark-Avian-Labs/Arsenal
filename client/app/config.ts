function readTrimmedEnv(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export const APP_DISPLAY_NAME = readTrimmedEnv(
  import.meta.env.VITE_APP_NAME as string | undefined,
  'AppBase',
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

export const LEGAL_CONTACT_NAME = readTrimmedEnv(
  import.meta.env.VITE_LEGAL_CONTACT_NAME as string | undefined,
  'Legal contact not configured',
);

export const LEGAL_CONTACT_STREET = readTrimmedEnv(
  import.meta.env.VITE_LEGAL_CONTACT_STREET as string | undefined,
  '',
);

export const LEGAL_CONTACT_CITY = readTrimmedEnv(
  import.meta.env.VITE_LEGAL_CONTACT_CITY as string | undefined,
  '',
);

export const LEGAL_CONTACT_PHONE = readTrimmedEnv(
  import.meta.env.VITE_LEGAL_CONTACT_PHONE as string | undefined,
  '',
);

export const LEGAL_CONTACT_EMAIL = readTrimmedEnv(
  import.meta.env.VITE_LEGAL_CONTACT_EMAIL as string | undefined,
  '',
);
