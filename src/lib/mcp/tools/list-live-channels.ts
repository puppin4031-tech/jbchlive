import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_live_channels",
  title: "List live channels",
  description: "List church channels that are currently broadcasting live.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("channels")
      .select("id, name, description, is_live, current_viewers, live_started_at")
      .eq("is_live", true)
      .eq("is_approved", true)
      .eq("is_suspended", false)
      .order("current_viewers", { ascending: false })
      .limit(50);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { channels: data ?? [] },
    };
  },
});
