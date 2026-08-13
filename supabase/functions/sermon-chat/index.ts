import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeadersFor } from "../_shared/cors.ts";
import { rateLimit, clientKey } from "../_shared/rateLimit.ts";

const MAX_MESSAGES = 20;
const MAX_CHARS_PER_MESSAGE = 2000;
const MAX_TOTAL_CHARS = 12000;

/** Returns the signed-in user id, or null when the request is anonymous. */
async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data } = await client.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // AI chat is an interactive feature: sign-in required (viewing stays public).
    const userId = await getUserId(req);
    if (!userId) {
      return json({ error: "로그인 후 이용할 수 있습니다." }, 401);
    }

    // 5분에 20회 제한 (사용자 단위 + IP 단위)
    for (const key of [`chat:user:${userId}`, clientKey(req, "chat:ip")]) {
      const { allowed, retryAfterSeconds } = rateLimit(key, 20, 5 * 60 * 1000);
      if (!allowed) {
        return json(
          { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
          429,
          { "Retry-After": String(retryAfterSeconds) },
        );
      }
    }

    const { messages, sermonContext } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "잘못된 요청입니다." }, 400);
    }
    if (messages.length > MAX_MESSAGES) {
      return json({ error: "대화가 너무 깁니다. 새 대화를 시작해주세요." }, 400);
    }
    let totalChars = 0;
    for (const m of messages) {
      const content = typeof m?.content === "string" ? m.content : "";
      const role = m?.role;
      if (!content || (role !== "user" && role !== "assistant")) {
        return json({ error: "잘못된 요청입니다." }, 400);
      }
      if (content.length > MAX_CHARS_PER_MESSAGE) {
        return json({ error: "질문이 너무 깁니다." }, 400);
      }
      totalChars += content.length;
    }
    if (totalChars > MAX_TOTAL_CHARS) {
      return json({ error: "대화가 너무 깁니다. 새 대화를 시작해주세요." }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const clip = (v: unknown, n = 300) => (typeof v === "string" ? v.slice(0, n) : "없음");
    const contextInfo = sermonContext
      ? `\n\n현재 설교 정보:\n- 제목: ${clip(sermonContext.title)}\n- 설교자: ${clip(sermonContext.preacher, 100)}\n- 설명: ${clip(sermonContext.description, 1000)}\n- 카테고리: ${clip(sermonContext.category, 100)}`
      : "";


    const systemPrompt = `당신은 성경 말씀 도우미 AI입니다. 사용자가 현재 시청 중인 설교 영상에 관한 질문이나 성경에 대한 질문에 답변합니다.
${contextInfo}

## 신학적 답변 기준
다음의 신학적 기준을 바탕으로 답변하세요:

1. **문자적·역사적·문법적 성경 해석**: 성경 본문의 원래 의미를 문맥과 역사적 배경 속에서 해석합니다.
2. **청교도 신학 전통**: 웨스트민스터 신앙고백과 청교도 신학자들(존 오웬, 토마스 왓슨, 조나단 에드워즈 등)의 가르침을 참고합니다.
3. **성경의 무오성과 충족성**: 성경은 하나님의 영감으로 기록된 오류 없는 말씀이며, 신앙과 생활의 유일한 규범입니다.
4. **침례교 신앙고백 (1689 런던 침례교 신앙고백)**: 침례교의 핵심 교리(신자의 침례, 지역 교회의 자율성, 만인 제사장 등)를 존중합니다.
5. **성경 중심 해석**: 성경을 성경으로 해석하며(scriptura scripturae interpres), 모든 교리는 성경에 근거해야 합니다.

## 답변 지침
- 한국어로 답변하세요.
- 성경 구절을 인용할 때는 개역개정판을 기본으로 사용하세요.
- 답변은 간결하되 핵심을 놓치지 않도록 하세요.
- 신학적으로 논쟁이 있는 주제에 대해서는 위의 신학적 기준에 따라 답변하되, 다른 관점이 있음을 간략히 언급할 수 있습니다.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI 크레딧이 부족합니다." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI 서비스 오류가 발생했습니다." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    // Never surface internal error details to the client.
    console.error("sermon-chat error:", e);
    return json({ error: "AI 서비스 오류가 발생했습니다." }, 500);
  }

});
