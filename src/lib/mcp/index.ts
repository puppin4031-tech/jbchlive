import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLiveChannelsTool from "./tools/list-live-channels";
import searchSermonsTool from "./tools/search-sermons";
import getSermonTool from "./tools/get-sermon";
import listMyNotesTool from "./tools/list-my-notes";
import saveSermonNoteTool from "./tools/save-sermon-note";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "live-word-stream",
  title: "Live Word Stream",
  version: "0.1.0",
  instructions:
    "Tools for Live Word Stream, a church sermon streaming platform. Use `list_live_channels` for current live broadcasts, `search_sermons` / `get_sermon` to browse sermon videos, and `list_my_sermon_notes` / `save_sermon_note` for the signed-in user's personal sermon notes.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listLiveChannelsTool,
    searchSermonsTool,
    getSermonTool,
    listMyNotesTool,
    saveSermonNoteTool,
  ],
});
