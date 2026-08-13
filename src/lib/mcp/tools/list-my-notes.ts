import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_sermon_notes",
  title: "List my sermon notes",
  description: "List the signed-in user's sermon notes, optionally filtered by sermon.",
  inputSchema: {
    sermon_id: z.string().uuid().optional().describe("Only return notes for this sermon."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sermon_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("sermon_notes")
      .select("id, sermon_id, content, image_url, created_at, updated_at")
      .eq("user_id", ctx.getUserId())
      .order("updated_at", { ascending: false })
      .limit(50);
    if (sermon_id) query = query.eq("sermon_id", sermon_id);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { notes: data ?? [] },
    };
  },
});
