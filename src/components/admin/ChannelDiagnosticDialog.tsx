import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import * as liveApi from '@/lib/liveStreamApi';
import { Button } from '@/components/ui/button';

type Props = {
  channelId: string | null;
  channelName?: string;
  onClose: () => void;
};

type Diag = Awaited<ReturnType<typeof liveApi.diagnoseChannel>>;

const humanizeState = (state?: string) => {
  switch (state) {
    case 'STREAMING': return { text: '송출 중 (정상)', tone: 'ok' as const };
    case 'AWAITING_INPUT': return { text: 'OBS 입력 대기 중', tone: 'warn' as const };
    case 'STARTING': return { text: '서버 준비 중 (5분 이상이면 문제)', tone: 'warn' as const };
    case 'STOPPING': return { text: '종료 처리 중', tone: 'warn' as const };
    case 'STOPPED': return { text: '중지됨', tone: 'ok' as const };
    case 'ERROR': return { text: '오류 상태', tone: 'error' as const };
    case 'RECOVERING': return { text: '자동 복구 진행 중', tone: 'warn' as const };
    case 'FORCE_STOPPED': return { text: '관리자 강제 종료됨', tone: 'ok' as const };
    default: return { text: state || 'UNKNOWN', tone: 'warn' as const };
  }
};

const interpretIssues = (d: Diag): { level: 'ok' | 'warn' | 'error'; message: string }[] => {
  const issues: { level: 'ok' | 'warn' | 'error'; message: string }[] = [];
  const db = (d.database ?? {}) as Record<string, unknown>;
  const gcpCh = d.gcp?.channel as Record<string, unknown>;
  const gcpInput = d.gcp?.input as Record<string, unknown>;
  const state = (gcpCh?.streamingState as string) || (db.gcp_channel_state as string);

  if (gcpCh?.error) {
    issues.push({ level: 'error', message: `GCP 채널 조회 실패: ${gcpCh.error}` });
  }
  if (gcpInput?.error) {
    issues.push({ level: 'error', message: `GCP 입력(Input) 조회 실패: ${gcpInput.error} — 입력이 삭제되었거나 프로젝트가 잘못됐을 수 있습니다. [재프로비저닝] 필요.` });
  }
  if (db.gcp_last_error) {
    issues.push({ level: 'warn', message: `최근 저장된 오류: ${String(db.gcp_last_error)}` });
  }
  if (state === 'STARTING' && db.live_started_at) {
    const ageMin = Math.floor((Date.now() - new Date(String(db.live_started_at)).getTime()) / 60000);
    if (ageMin >= 5) {
      issues.push({ level: 'error', message: `STARTING 상태로 ${ageMin}분 경과. GCP Live Stream API가 응답하지 않거나 채널이 wedge 상태. 강제 종료 후 재프로비저닝 권장.` });
    }
  }
  if (state === 'AWAITING_INPUT') {
    issues.push({ level: 'warn', message: 'OBS에서 RTMP 송출이 시작되지 않았습니다. OBS 서버 주소·스트림 키·네트워크 확인.' });
  }
  if (state === 'STREAMING' && !db.stream_url) {
    issues.push({ level: 'warn', message: 'STREAMING 상태지만 HLS URL이 저장되지 않았습니다. 상태 조회를 재실행하세요.' });
  }
  // Failed operations
  const failedOps = (d.gcp?.operations || []).filter((op: Record<string, unknown>) => op.error);
  if (failedOps.length > 0) {
    const first = failedOps[0] as Record<string, unknown>;
    const err = first.error as Record<string, unknown> | undefined;
    issues.push({ level: 'error', message: `최근 GCP 작업 실패: ${(err?.message as string) || JSON.stringify(err)}` });
  }
  if (issues.length === 0) {
    issues.push({ level: 'ok', message: '진단상 특이 사항 없음.' });
  }
  return issues;
};

const ChannelDiagnosticDialog = ({ channelId, channelName, onClose }: Props) => {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['diagnose-channel', channelId],
    queryFn: () => liveApi.diagnoseChannel(channelId!),
    enabled: !!channelId,
    refetchOnWindowFocus: false,
  });

  const db = (data?.database ?? {}) as Record<string, unknown>;
  const gcpCh = (data?.gcp?.channel ?? {}) as Record<string, unknown>;
  const gcpInput = (data?.gcp?.input ?? {}) as Record<string, unknown>;
  const state = (gcpCh.streamingState as string) || (db.gcp_channel_state as string) || 'UNKNOWN';
  const stateInfo = humanizeState(state);
  const issues = data ? interpretIssues(data) : [];

  return (
    <Dialog open={!!channelId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>채널 진단: {channelName}</DialogTitle>
          <DialogDescription>
            DB · GCP 채널 · 입력(Input) · 최근 작업 오퍼레이션을 실시간 조회합니다.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3">
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> 진단 중…
            </div>
          ) : error ? (
            <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">
              진단 실패: {(error as Error).message}
            </div>
          ) : data ? (
            <div className="space-y-4 text-sm">
              {/* Summary */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground">현재 상태:</span>
                <Badge
                  variant={stateInfo.tone === 'error' ? 'destructive' : stateInfo.tone === 'ok' ? 'default' : 'outline'}
                >
                  {state}
                </Badge>
                <span className="text-xs text-muted-foreground">({stateInfo.text})</span>
              </div>

              {/* Issues */}
              <div className="space-y-2">
                <h4 className="font-semibold">진단 결과</h4>
                {issues.map((iss, i) => {
                  const Icon = iss.level === 'error' ? AlertTriangle : iss.level === 'warn' ? Info : CheckCircle2;
                  const cls = iss.level === 'error'
                    ? 'bg-destructive/10 text-destructive border-destructive/30'
                    : iss.level === 'warn'
                    ? 'bg-warning/10 text-warning-foreground border-warning/30'
                    : 'bg-muted/50 text-foreground border-border';
                  return (
                    <div key={i} className={`flex gap-2 items-start p-2 border rounded ${cls}`}>
                      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                      <p className="text-xs leading-relaxed">{iss.message}</p>
                    </div>
                  );
                })}
              </div>

              {/* Key fields */}
              <div>
                <h4 className="font-semibold mb-2">주요 정보</h4>
                <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">GCP Location</dt>
                  <dd className="font-mono">{data.gcp.location}</dd>
                  <dt className="text-muted-foreground">GCP Channel ID</dt>
                  <dd className="font-mono break-all">{data.gcp.channelId}</dd>
                  <dt className="text-muted-foreground">GCP Input ID</dt>
                  <dd className="font-mono break-all">{data.gcp.inputId}</dd>
                  <dt className="text-muted-foreground">RTMP URI</dt>
                  <dd className="font-mono break-all">{(db.gcp_input_uri as string) || '(없음)'}</dd>
                  <dt className="text-muted-foreground">HLS URL</dt>
                  <dd className="font-mono break-all">{(db.stream_url as string) || '(없음)'}</dd>
                  <dt className="text-muted-foreground">is_live (DB)</dt>
                  <dd>{String(db.is_live)}</dd>
                  <dt className="text-muted-foreground">DB 상태</dt>
                  <dd>{String(db.gcp_channel_state)}</dd>
                  <dt className="text-muted-foreground">라이브 시작</dt>
                  <dd>{db.live_started_at ? new Date(String(db.live_started_at)).toLocaleString('ko-KR') : '-'}</dd>
                </dl>
              </div>

              {/* Recent GCP operations */}
              <div>
                <h4 className="font-semibold mb-2">최근 GCP 작업 (최대 20건)</h4>
                {data.gcp.operations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">기록 없음</p>
                ) : (
                  <div className="space-y-1">
                    {data.gcp.operations.map((op, i) => {
                      const o = op as Record<string, unknown>;
                      const err = o.error as Record<string, unknown> | undefined;
                      return (
                        <div key={i} className={`text-xs p-2 rounded border ${err ? 'bg-destructive/5 border-destructive/30' : 'bg-muted/30'}`}>
                          <div className="flex justify-between gap-2">
                            <span className="font-mono">{String(o.verb || 'op')} · {o.done ? 'done' : 'in-progress'}</span>
                            <span className="text-muted-foreground">
                              {o.createTime ? new Date(String(o.createTime)).toLocaleTimeString('ko-KR') : ''}
                            </span>
                          </div>
                          {err && (
                            <p className="text-destructive mt-1 break-words">
                              ❌ {(err.message as string) || JSON.stringify(err)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Raw JSON */}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">원본 JSON (개발자용)</summary>
                <pre className="mt-2 p-2 bg-muted/50 rounded overflow-x-auto text-[10px] leading-tight">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            새로고침
          </Button>
          <Button size="sm" onClick={onClose}>닫기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChannelDiagnosticDialog;
