function computeAppPublicBaseUrlFromDomainParts(subdomainOverride?: string): string | null {
  const baseDomain = process.env.BASE_DOMAIN?.trim().toLowerCase();
  if (!baseDomain) {
    return null;
  }
  const protoRaw = process.env.BASE_PROTOCOL?.trim().toLowerCase();
  let protocol: 'http' | 'https';
  if (!protoRaw) {
    protocol = 'https';
  } else if (protoRaw === 'http' || protoRaw === 'https') {
    protocol = protoRaw;
  } else {
    return null;
  }
  const subdomain =
    subdomainOverride?.trim().toLowerCase() ||
    process.env.APP_SUBDOMAIN?.trim().toLowerCase() ||
    process.env.APP_ID?.trim().toLowerCase() ||
    'codex';
  return `${protocol}://${subdomain}.${baseDomain}`;
}

export interface AppPublicBaseUrlOptions {
  /**
   * Subdomain of the calling app (e.g. `armory`). Inside the unified Arsenal host every mounted
   * app shares one APP_PUBLIC_BASE_URL (Codex's), so apps that build absolute links for their own
   * host pass their subdomain to get `${BASE_PROTOCOL}://${subdomain}.${BASE_DOMAIN}` instead.
   */
  unifiedHostSubdomain?: string;
}

export function getAppPublicBaseUrl(options: AppPublicBaseUrlOptions = {}): string {
  const unifiedOverride =
    process.env.ARSENAL_UNIFIED_HOST === '1' && options.unifiedHostSubdomain?.trim()
      ? computeAppPublicBaseUrlFromDomainParts(options.unifiedHostSubdomain)
      : null;
  const configured =
    unifiedOverride ||
    process.env.APP_PUBLIC_BASE_URL?.trim() ||
    computeAppPublicBaseUrlFromDomainParts();
  if (!configured) {
    throw new Error(
      'APP_PUBLIC_BASE_URL must be set, or set BASE_DOMAIN with BASE_PROTOCOL and APP_SUBDOMAIN (or APP_ID).',
    );
  }
  const normalized = configured.replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('APP_PUBLIC_BASE_URL must be a valid URL.');
  }
  const isLocalHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1');
  const nodeEnv = process.env.NODE_ENV;
  const isKnownNonProductionEnv = nodeEnv === 'development' || nodeEnv === 'test';
  if (nodeEnv == null || (nodeEnv !== 'production' && !isKnownNonProductionEnv)) {
    console.warn(
      `Unknown or unset NODE_ENV "${nodeEnv ?? ''}" detected; defaulting APP_PUBLIC_BASE_URL protocol policy to production (https-only unless local http).`,
    );
  }
  if (parsed.protocol !== 'https:' && !(isLocalHttp || isKnownNonProductionEnv)) {
    throw new Error('APP_PUBLIC_BASE_URL must use https://');
  }
  return normalized;
}
