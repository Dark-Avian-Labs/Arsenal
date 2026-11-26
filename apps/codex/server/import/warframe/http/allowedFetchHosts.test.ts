import dns from 'node:dns/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertAllowedFetchUrl,
  assertAllowedImageMime,
  getPinnedAddresses,
  isAllowedEquipmentImage,
} from './allowedFetchHosts.ts';

describe('allowedFetchHosts SSRF & image guards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid URLs, non-HTTPS protocols, and non-allowlisted hosts', async () => {
    await expect(assertAllowedFetchUrl('not a url')).rejects.toThrow(/Invalid fetch URL/);
    await expect(assertAllowedFetchUrl('http://wiki.warframe.com/test')).rejects.toThrow(/non-HTTPS/);
    await expect(assertAllowedFetchUrl('https://evil.example.com/payload')).rejects.toThrow(/non-allowlisted host/);
  });

  it('blocks allowlisted hosts that resolve to loopback, RFC1918, link-local, or IPv4-mapped private IPs', async () => {
    for (const privateIp of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.5', '::1', '::ffff:127.0.0.1']) {
      vi.spyOn(dns, 'lookup').mockResolvedValueOnce([{ address: privateIp, family: privateIp.includes(':') ? 6 : 4 }]);
      await expect(assertAllowedFetchUrl('https://wiki.warframe.com/w/Excalibur')).rejects.toThrow(
        /private\/loopback IP/,
      );
    }
  });

  it('allows allowlisted HTTPS hosts resolving to public IPs and pins their addresses', async () => {
    const publicRecords = [{ address: '104.18.10.20', family: 4 }];
    vi.spyOn(dns, 'lookup').mockResolvedValueOnce(publicRecords);

    const parsed = await assertAllowedFetchUrl('https://wiki.warframe.com/w/Excalibur');
    expect(parsed.hostname).toBe('wiki.warframe.com');
    expect(getPinnedAddresses('wiki.warframe.com')).toEqual(publicRecords);
  });

  it('validates image Content-Type headers and equipment image URLs', () => {
    expect(() => assertAllowedImageMime('image/webp; charset=binary')).not.toThrow();
    expect(() => assertAllowedImageMime(null)).not.toThrow();
    expect(() => assertAllowedImageMime('text/html')).toThrow(/non-image Content-Type/);
    expect(() => assertAllowedImageMime('image/svg+xml')).toThrow(/non-image Content-Type/);

    expect(isAllowedEquipmentImage('/images/excalibur.png')).toBe(true);
    expect(isAllowedEquipmentImage('https://content.warframe.com/PublicExport/img.png')).toBe(true);
    expect(isAllowedEquipmentImage('javascript:alert(1)')).toBe(false);
    expect(isAllowedEquipmentImage('data:image/svg+xml,<svg/>')).toBe(false);
    expect(isAllowedEquipmentImage('http://content.warframe.com/img.png')).toBe(false);
    expect(isAllowedEquipmentImage('https://attacker.example/img.png')).toBe(false);
  });
});
