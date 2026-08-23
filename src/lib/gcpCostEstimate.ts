/**
 * GCP Live Stream API cost estimation constants and helpers.
 *
 * Cost model (agreed with the broadcaster):
 *  - Encoding (channel uptime): billed per broadcast hour regardless of viewers.
 *  - Egress (viewer traffic): billed per GB delivered to viewers.
 *
 * These are ESTIMATES — actual GCP console billing may differ slightly.
 * Adjust the constants here if GCP pricing changes.
 */

/** Channel uptime cost per hour (HD 720p H.264, asia-northeast1). */
export const ENCODING_USD_PER_HOUR = 1.08;

/** Network egress cost per GB (GCS download, asia-northeast1). */
export const EGRESS_USD_PER_GB = 0.12;

/** Estimated GB consumed per viewer per hour at current 720p/1.5Mbps settings. */
export const GB_PER_VIEWER_HOUR = 1.0;

/** Default USD -> KRW exchange rate (admin can adjust in the UI). */
export const DEFAULT_USD_TO_KRW = 1350;

export interface CostBreakdown {
  /** Total broadcast hours. */
  broadcastHours: number;
  /** Total viewer-hours (sum of avg viewers x duration). */
  viewerHours: number;
  /** Estimated egress in GB. */
  egressGb: number;
  /** Encoding cost in USD. */
  encodingUsd: number;
  /** Egress cost in USD. */
  egressUsd: number;
  /** Total cost in USD. */
  totalUsd: number;
  /** Total cost in KRW. */
  totalKrw: number;
}

export function estimateCost(
  broadcastSeconds: number,
  viewerHours: number,
  usdToKrw: number = DEFAULT_USD_TO_KRW,
): CostBreakdown {
  const broadcastHours = broadcastSeconds / 3600;
  const egressGb = viewerHours * GB_PER_VIEWER_HOUR;
  const encodingUsd = broadcastHours * ENCODING_USD_PER_HOUR;
  const egressUsd = egressGb * EGRESS_USD_PER_GB;
  const totalUsd = encodingUsd + egressUsd;
  return {
    broadcastHours,
    viewerHours,
    egressGb,
    encodingUsd,
    egressUsd,
    totalUsd,
    totalKrw: totalUsd * usdToKrw,
  };
}

/** Format helpers */
export const formatKrw = (krw: number) =>
  `${Math.round(krw).toLocaleString('ko-KR')}원`;

export const formatGb = (gb: number) =>
  gb >= 100 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;

export const formatHours = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
};
