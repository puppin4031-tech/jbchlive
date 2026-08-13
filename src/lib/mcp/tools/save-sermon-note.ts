import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "save_sermon_note",
  title: "Save sermon note",
  description: "Create or update the signed-in user's note for a sermon.",
  inputSchema: {
    sermon_id: z.string().uuid().describe("Sermon UUID the note belongs to."),
    content: z.string().min(1).describe("Note text."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ sermon_id, content }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    const { data: existing, error: findError } = await supabase
      .from("sermon_notes")
      .select("id")
      .eq("user_id", userId)
      .eq("sermon_id", sermon_id)
      .maybeSingle();
    if (findError) return { content: [{ type: "text", text: findError.message }], isError: true };

    const { data, error } = existing
      ? await supabase
          .from("sermon_notes")
          .update({ content, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select()
      : await supabase
          .from("sermon_notes")
          .insert({ user_id: userId, sermon_id, content })
          .select();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data?.[0] ?? null) }],
      structuredContent: { note: data?.[0] ?? null },
    };
  },
});
