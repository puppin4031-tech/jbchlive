import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, sermonContext } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const contextInfo = sermonContext
      ? `\n\n현재 설교 정보:\n- 제목: ${sermonContext.title || "없음"}\n- 설교자: ${sermonContext.preacher || "없음"}\n- 설명: ${sermonContext.description || "없음"}\n- 카테고리: ${sermonContext.category || "없음"}`
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
    console.error("sermon-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
