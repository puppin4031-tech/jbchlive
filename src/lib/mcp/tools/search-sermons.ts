import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_sermons",
  title: "Search sermons",
  description: "Search sermon videos by keyword in title, preacher, or description.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Keyword to search for."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const escaped = query.replace(/[%,()]/g, " ").trim();
    const { data, error } = await supabase
      .from("sermons")
      .select("id, title, preacher, category, sermon_date, description, channel_id, view_count")
      .eq("is_hidden", false)
      .or(`title.ilike.%${escaped}%,preacher.ilike.%${escaped}%,description.ilike.%${escaped}%`)
      .order("sermon_date", { ascending: false })
      .limit(limit ?? 20);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { sermons: data ?? [] },
    };
  },
});
