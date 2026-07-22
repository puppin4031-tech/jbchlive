import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ytOAuthCallback } from "@/lib/youtubeLiveApi";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const YouTubeCallbackPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"pending" | "ok" | "error">("pending");
  const [message, setMessage] = useState<string>("");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    if (error) {
      setStatus("error");
      setMessage(error);
      return;
    }
    if (!code || !state) {
      setStatus("error");
      setMessage("잘못된 콜백 요청입니다.");
      return;
    }
    const redirectUri = `${window.location.origin}/auth/youtube/callback`;
    ytOAuthCallback(code, state, redirectUri)
      .then((res) => {
        setStatus("ok");
        setMessage(res.youtubeChannelTitle || "연결 완료");
      })
      .catch((e: unknown) => {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : String(e));
      });
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-4">
        {status === "pending" && (
          <>
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
            <p className="text-foreground">YouTube 계정 연결 중...</p>
          </>
        )}
        {status === "ok" && (
          <>
            <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
            <h1 className="text-lg font-semibold">YouTube 연결 완료</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button onClick={() => navigate("/my-channel")}>내 채널로 돌아가기</Button>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-12 h-12 mx-auto text-destructive" />
            <h1 className="text-lg font-semibold">연결 실패</h1>
            <p className="text-sm text-muted-foreground break-words">{message}</p>
            <Button variant="outline" onClick={() => navigate("/my-channel")}>돌아가기</Button>
          </>
        )}
      </div>
    </div>
  );
};

export default YouTubeCallbackPage;
