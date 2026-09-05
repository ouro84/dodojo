import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADD_TASK_TOOL,
  buildAddTaskToolResult,
  buildToolErrorResult,
  type McpTool,
  type McpToolResult,
} from "./mcp-protocol";
import { insertTaskForUser } from "./task-insertion";
import { validateTaskTitle } from "./task-title";
import { hasScope, type OAuthScope } from "./oauth-scopes";

export interface McpContext {
  supabase: SupabaseClient;
  userId: string;
  timezone: string;
}

export interface McpToolDef {
  tool: McpTool;
  requiredScope: OAuthScope;
  parseArgs: (args: Record<string, unknown>) => Record<string, unknown> | { error: string };
  handler: (ctx: McpContext, args: Record<string, unknown>) => Promise<McpToolResult>;
}

function parseAddTaskArgs(args: Record<string, unknown>): Record<string, unknown> | { error: string } {
  const rawTitle = args.title;
  if (typeof rawTitle !== "string") {
    return { error: "title est requis (string)." };
  }
  return { title: rawTitle };
}

async function handleAddTask(ctx: McpContext, args: Record<string, unknown>): Promise<McpToolResult> {
  const validation = validateTaskTitle(args.title as string);
  if ("error" in validation) {
    return buildToolErrorResult(validation.error);
  }

  try {
    const outcome = await insertTaskForUser(ctx.supabase, {
      userId: ctx.userId,
      title: validation.title,
      timezone: ctx.timezone,
    });
    return buildAddTaskToolResult(outcome);
  } catch {
    return buildToolErrorResult("insert_task_failed");
  }
}

// Registry extensible : PR3 (lecture) et PR4 (ecriture) ajouteront leurs
// entrees ici, jamais une nouvelle chaine de if dans app/api/mcp/route.ts.
export const TOOL_REGISTRY: readonly McpToolDef[] = [
  {
    tool: ADD_TASK_TOOL,
    requiredScope: "tasks:write",
    parseArgs: parseAddTaskArgs,
    handler: handleAddTask,
  },
];

export function findTool(name: string): McpToolDef | undefined {
  return TOOL_REGISTRY.find((def) => def.tool.name === name);
}

// tools/list ne doit exposer que ce qu'un agent peut reellement appeler -
// sinon il tente, echoue, et brule des tours (D3.1 du spec).
export function toolsForScope(grantedScope: string): McpTool[] {
  return TOOL_REGISTRY.filter((def) => hasScope(grantedScope, def.requiredScope)).map(
    (def) => def.tool,
  );
}
