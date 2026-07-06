/**
 * GCP Live Stream / RTMP 관련 raw 에러를 사용자 친화적인 한국어 메시지로 변환.
 * 송출자(나이드신 분 포함)도 이해할 수 있도록 짧고 명확하게.
 */

export interface FriendlyError {
  title: string;
  message: string;
  hint?: string;
  /** 원본 raw error (디버그용, UI에서는 작게 표시) */
  raw?: string;
}

/**
 * RTMP URI 형식 검증.
 * 예: rtmp://1.2.3.4:1935/live/streamkey
 */
export const isValidRtmpUri = (uri: string | null | undefined): boolean => {
  if (!uri || typeof uri !== "string") return false;
  return /^rtmps?:\/\/[^\s/]+(:\d+)?\/[^\s/]+\/[^\s/]+$/.test(uri.trim());
};

/**
 * HLS / 일반 스트림 URL 검증 (https + .m3u8 권장).
 */
export const isValidStreamUrl = (url: string | null | undefined): boolean => {
  if (!url || typeof url !== "string") return false;
  const u = url.trim();
  return /^https?:\/\/.+/i.test(u);
};

/**
 * 송출 시작 전 채널의 RTMP 정보가 유효한지 검증.
 */
export const validateBeforeStart = (channel: {
  is_approved?: boolean | null;
  is_suspended?: boolean | null;
  gcp_input_uri?: string | null;
}): FriendlyError | null => {
  if (channel.is_suspended) {
    return {
      title: "채널이 일시 정지되었습니다",
      message: "관리자에게 문의해주세요.",
    };
  }
  if (!channel.is_approved) {
    return {
      title: "아직 승인되지 않은 채널입니다",
      message: "관리자 승인을 기다려주세요.",
    };
  }
  // gcp_input_uri는 첫 시작 시 자동 프로비저닝되므로 체크하지 않음.
  // 단, 존재한다면 형식이 올바른지 확인.
  if (channel.gcp_input_uri && !isValidRtmpUri(channel.gcp_input_uri)) {
    return {
      title: "송출 주소가 올바르지 않습니다",
      message: "관리자에게 채널 재설정을 요청해주세요.",
      raw: channel.gcp_input_uri,
    };
  }
  return null;
};

/**
 * Edge Function / GCP에서 올라온 에러를 분류해서 친화적 메시지로 변환.
 */
export const toFriendlyError = (err: unknown): FriendlyError => {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);

  const m = raw.toLowerCase();

  // 네트워크
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("network request failed")) {
    return {
      title: "인터넷 연결을 확인해주세요",
      message: "네트워크 상태를 확인하시고 잠시 후 다시 시도해주세요.",
      raw,
    };
  }

  // 인증
  if (m.includes("unauthorized") || m.includes("401")) {
    return {
      title: "로그인이 필요합니다",
      message: "다시 로그인하신 후 시도해주세요.",
      raw,
    };
  }
  if (m.includes("forbidden") || m.includes("403")) {
    return {
      title: "권한이 없습니다",
      message: "본인 채널에서만 송출을 시작·종료할 수 있습니다.",
      raw,
    };
  }

  // 레이트 리밋
  if (m.includes("rate limit")) {
    const sec = raw.match(/retry after (\d+)/i)?.[1];
    return {
      title: "너무 자주 시도했습니다",
      message: sec
        ? `${sec}초 후에 다시 시도해주세요.`
        : "잠시 후 다시 시도해주세요.",
      raw,
    };
  }

  // GCP: 채널이 이미 시작/실행 중
  if (m.includes("already") && (m.includes("running") || m.includes("started"))) {
    return {
      title: "이미 라이브가 시작되어 있습니다",
      message: "잠시 후 화면이 자동으로 갱신됩니다.",
      raw,
    };
  }

  // GCP: 시작 준비 중에는 종료 불가
  if (m.includes("starting") && (m.includes("준비 중") || m.includes("awaiting_input"))) {
    return {
      title: "서버가 아직 준비 중입니다",
      message: "파란색 OBS 대기 상태가 된 뒤 종료할 수 있습니다. 지금은 종료 버튼을 누르지 말고 잠시 기다려주세요.",
      raw,
    };
  }

  // GCP: 정지 시 이미 멈춤
  if (m.includes("failed_precondition") || m.includes("not running")) {
    return {
      title: "라이브가 이미 종료되어 있습니다",
      message: "다시 시작하시려면 [라이브 시작]을 눌러주세요.",
      raw,
    };
  }

  // GCP: quota / 자원 한계
  if (m.includes("quota") || m.includes("resource_exhausted")) {
    return {
      title: "송출 서버 자원이 부족합니다",
      message: "잠시 후 다시 시도해주시거나 관리자에게 문의해주세요.",
      raw,
    };
  }

  // 채널 미프로비저닝
  if (m.includes("not provisioned")) {
    return {
      title: "채널이 아직 준비되지 않았습니다",
      message: "관리자에게 채널 활성화를 요청해주세요.",
      raw,
    };
  }

  // 타임아웃
  if (m.includes("timeout") || m.includes("timed out")) {
    return {
      title: "서버 응답이 지연되고 있습니다",
      message: "GCP 서버 준비에 시간이 걸리고 있습니다. 1~2분 후 다시 확인해주세요.",
      raw,
    };
  }

  // RTMP 관련 (입력 누락 / 끊김)
  if (m.includes("rtmp") && (m.includes("invalid") || m.includes("missing"))) {
    return {
      title: "RTMP 송출 주소에 문제가 있습니다",
      message: "OBS 설정에 입력한 서버 주소·스트림 키가 올바른지 확인해주세요.",
      raw,
    };
  }

  // GCP 일반 에러
  if (m.includes("gcp api error")) {
    return {
      title: "송출 서버에서 오류가 발생했습니다",
      message: "잠시 후 다시 시도해주세요. 계속되면 관리자에게 문의해주세요.",
      raw,
    };
  }

  // 기본
  return {
    title: "알 수 없는 오류가 발생했습니다",
    message: "잠시 후 다시 시도해주세요. 계속되면 관리자에게 문의해주세요.",
    raw,
  };
};
