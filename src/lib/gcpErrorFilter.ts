/**
 * Some GCP errors are expected/non-actionable and must not be surfaced
 * to broadcasters or admins as warnings. Currently:
 *  - "HLS output bucket access blocked" caused by Domain Restricted Sharing
 *    org policy (allUsers not permitted). Playback still works via backend proxy.
 */
const SUPPRESSED_PATTERNS = [
  /HLS output bucket access blocked/i,
  /permitted customer/i,
  /conditionNotMet/i,
  /allowedPolicyMemberDomains/i,
  /HLS manifest not ready/i,
  /ManifestNotWritten/i,
  /manifest.*not.*written/i,
  /manifest.*not.*ready/i,
];

export const isSuppressedGcpError = (msg: string | null | undefined): boolean => {
  if (!msg) return false;
  return SUPPRESSED_PATTERNS.some((r) => r.test(msg));
};

/** Returns the error message only if it is user-actionable. */
export const visibleGcpError = (msg: string | null | undefined): string | null => {
  if (!msg) return null;
  return isSuppressedGcpError(msg) ? null : msg;
};
