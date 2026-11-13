import { useState } from 'react';
import { X } from 'lucide-react';

const DISMISS_KEY = 'chrome_notice_dismissed';

function isRealChrome(): boolean {
  const ua = navigator.userAgent;
  if (/CriOS/i.test(ua)) return true; // Chrome on iOS
  const isChromium = /Chrome\//.test(ua);
  const isOther = /Edg|OPR|SamsungBrowser|Whale|NAVER|KAKAOTALK|Instagram|FBAN|FBAV|Line|wv\)|DaumApps|YaBrowser/i.test(ua);
  return isChromium && !isOther;
}

function chromeUrl(): string {
  const url = window.location.href;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) {
    return `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return url.replace(/^https/, 'googlechromes').replace(/^http:/, 'googlechrome:');
  return 'https://www.google.com/chrome/';
}

const ChromeNotice = () => {
  const [hidden, setHidden] = useState(() => {
    try { return isRealChrome() || sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return isRealChrome(); }
  });
  if (hidden) return null;
  return (
    <div className="bg-primary text-primary-foreground">
      <div className="container flex items-center gap-2 px-4 py-2">
        <a href={chromeUrl()} className="flex-1 text-base md:text-sm font-semibold underline underline-offset-2">
          구글 크롬으로 사이트 접속하기 (원활한 시청을 위해 권장)
        </a>
        <button
          type="button"
          aria-label="닫기"
          className="min-w-11 min-h-11 flex items-center justify-center"
          onClick={() => { try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } setHidden(true); }}
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ChromeNotice;
