import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { CreateBroadcastResult } from "@/lib/youtubeLiveApi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CreateBroadcastResult | null;
  isPending?: boolean;
}

const CopyRow = ({ label, value }: { label: string; value: string }) => (
  <div>
    <span className="text-xs text-muted-foreground">{label}</span>
    <div className="mt-1 flex gap-1">
      <code className="flex-1 rounded bg-muted p-2 text-xs break-all font-mono">{value}</code>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast.success("복사되었습니다");
        }}
      >
        <Copy className="w-3 h-3" />
      </Button>
    </div>
  </div>
);

const YouTubeStartLiveDialog = ({ open, onOpenChange, data, isPending }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>🔴 주일말씀 (YouTube Live) 준비 완료</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {isPending || !data ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">YouTube 라이브 방송을 생성하는 중...</p>
            </div>
          ) : (
            <>
              <p className="text-sm">
                OBS 스트림 설정에 아래 값을 입력하고 [방송 시작]을 누르세요. 잠시 후 자동으로 라이브가 시작됩니다.
              </p>
              <CopyRow label="서버 URL" value={data.rtmpUrl} />
              <CopyRow label="스트림 키" value={data.streamKey} />
              <div className="pt-2 border-t border-border">
                <a
                  href={data.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-sm inline-flex items-center gap-1 hover:underline"
                >
                  YouTube 시청 페이지 열기 <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default YouTubeStartLiveDialog;
