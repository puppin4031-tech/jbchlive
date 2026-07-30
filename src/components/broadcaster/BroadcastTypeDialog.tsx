import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Radio } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: "gathering") => void;
}

const BroadcastTypeDialog = ({ open, onOpenChange, onSelect }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>방송 유형 선택</DialogTitle>
          <DialogDescription>
            현재는 자체 스트리밍 방식으로만 송출할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <Button
            variant="outline"
            className="h-auto py-4 flex-col items-start gap-1 text-left"
            onClick={() => onSelect("gathering")}
          >
            <div className="flex items-center gap-2 text-base font-semibold">
              <Radio className="w-5 h-5 text-primary" /> 집회 (자체 스트리밍)
            </div>
            <p className="text-xs text-muted-foreground whitespace-normal">
              GCP Live Stream 자체 인프라로 송출합니다.
            </p>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BroadcastTypeDialog;
