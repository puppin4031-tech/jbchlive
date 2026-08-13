import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_sermon",
  title: "Get sermon details",
  description: "Fetch full details for one sermon by its ID.",
  inputSchema: { sermon_id: z.string().uuid().describe("Sermon UUID.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sermon_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("sermons")
      .select("id, title, preacher, category, sermon_date, description, duration, video_url, thumbnail_url, view_count, channel_id")
      .eq("id", sermon_id)
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Sermon not found" }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { sermon: data },
    };
  },
});
