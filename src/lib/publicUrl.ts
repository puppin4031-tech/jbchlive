/**
 * Returns the canonical public origin for share links.
 * In preview/dev environments window.location.origin points to an internal
 * preview URL that outside users can't access, so we force the published
 * domain for any URL meant to be shared.
 */
const PUBLIC_ORIGIN = 'https://jbchlive.lovable.app';

export const getPublicOrigin = (): string => {
  if (typeof window === 'undefined') return PUBLIC_ORIGIN;
  const host = window.location.hostname;
  // Use real origin only when already on the public domain or a custom domain
  if (host === 'jbchlive.lovable.app' || (!host.includes('lovable.app') && !host.includes('localhost'))) {
    return window.location.origin;
  }
  return PUBLIC_ORIGIN;
};

export const getPublicLiveUrl = (channelId: string): string =>
  `${getPublicOrigin()}/live/${channelId}`;
