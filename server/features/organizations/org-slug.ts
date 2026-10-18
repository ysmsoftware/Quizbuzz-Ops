/**
 * Org slugs are the first URL segment of the main app's public pages (/<orgSlug>/contests/…),
 * so they can't collide with a top-level route of the main frontend.
 *
 * KEEP IN SYNC with RESERVED_ORG_SLUGS in
 * Quizbuzz-new/backend/src/modules/organization/organization.service.ts (different repo —
 * this cannot be imported).
 */
export const RESERVED_ORG_SLUGS: ReadonlySet<string> = new Set([
  'accept-invite', 'ambassador', 'api', 'campaigns', 'contact', 'contests', 'cookies', 'faq',
  'forgot-password', 'help', 'login', 'offline', 'org', 'payment', 'portal', 'privacy', 'quiz',
  'register', 'reset-password', 'status', 'terms', 'verify-email', 'sitemap.xml', 'robots.txt',
  'solutions', 'institution-mode',
  'manifest.webmanifest', 'sw.js', '_next', 'static', 'storage',
]);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}
