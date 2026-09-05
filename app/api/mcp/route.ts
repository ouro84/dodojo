import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hashOpaqueToken, isExpired } from "../../../lib/oauth-tokens";
import { consumeMcpQuota } from "../../../lib/mcp-rate-limit";
import { findTool, toolsForScope, type McpContext } from "../../../lib/mcp-tools";
import { hasScope } from "../../../lib/oauth-scopes";
import {
  buildInitializeResult,
  buildToolErrorResult,
  errorResponse,
  parseJsonRpcRequest,
  successResponse,
  JSON_RPC_ERROR_INVALID_PARAMS,
  JSON_RPC_ERROR_METHOD_NOT_FOUND,
  type JsonRpcRequest,
} from "../../../lib/mcp-protocol";

// hashOpaqueToken utilise node:crypto - pas compatible edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OAuthTokenRow {
  user_id: string;
  expires_at: string;
  scope: string;
}

interface ProfileTimezoneRow {
  timezone: string;
}

function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme !== "Bearer" || !value) return null;
  return value;
}

// 401 avec WWW-Authenticate pointant la metadonnee RFC 9728 : c'est ainsi
// qu'un client MCP conforme decouvre le serveur d'autorisation associe a
// cette ressource protegee.
function unauthorized(request: Request): Response {
  const origin = new URL(request.url).origin;
  return new NextResponse(null, {
    status: 401,
    headers: { "WWW-Authenticate": 'Bearer resource_metadata="' + origin + '/.well-known/oauth-protected-resource"' },
  });
}

function serviceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

// US-22/issue #201 : serveur MCP (Resource Server), transport Streamable
// HTTP. Verifie le Bearer token (hash + expiration), applique un rate limit
// autoritaire par utilisateur, puis route via le registry de tools
// (lib/mcp-tools.ts) filtre par le scope du token.
export async function POST(request: Request): Promise<Response> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized(request);

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const { data: tokenRow } = await supabase
    .from("oauth_tokens")
    .select("user_id, expires_at, scope")
    .eq("access_token_hash", hashOpaqueToken(token))
    .maybeSingle();

  const resolvedToken = tokenRow as OAuthTokenRow | null;
  if (!resolvedToken || isExpired(resolvedToken.expires_at)) {
    return unauthorized(request);
  }

  const allowed = await consumeMcpQuota(supabase, resolvedToken.user_id);
  if (!allowed) {
    return NextResponse.json(errorResponse(null, JSON_RPC_ERROR_INVALID_PARAMS, "rate_limited"), { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse(null, JSON_RPC_ERROR_INVALID_PARAMS, "invalid_json"), { status: 400 });
  }

  const rpcRequest = parseJsonRpcRequest(body);
  if (!rpcRequest) {
    return NextResponse.json(
      errorResponse(null, JSON_RPC_ERROR_INVALID_PARAMS, "invalid_jsonrpc_request"),
      { status: 400 },
    );
  }

  if (rpcRequest.method === "notifications/initialized") {
    return new NextResponse(null, { status: 202 });
  }
  if (rpcRequest.method === "initialize") {
    return NextResponse.json(successResponse(rpcRequest.id, buildInitializeResult()));
  }
  if (rpcRequest.method === "tools/list") {
    return NextResponse.json(successResponse(rpcRequest.id, { tools: toolsForScope(resolvedToken.scope) }));
  }
  if (rpcRequest.method === "tools/call") {
    return handleToolsCall(supabase, resolvedToken.user_id, resolvedToken.scope, rpcRequest);
  }

  return NextResponse.json(
    errorResponse(rpcRequest.id, JSON_RPC_ERROR_METHOD_NOT_FOUND, "Methode inconnue : " + rpcRequest.method),
  );
}

async function handleToolsCall(
  supabase: SupabaseClient,
  userId: string,
  grantedScope: string,
  rpcRequest: JsonRpcRequest,
): Promise<Response> {
  const toolName = rpcRequest.params?.name;
  const args = (rpcRequest.params?.arguments as Record<string, unknown> | undefined) ?? {};

  const def = findTool(String(toolName));
  if (!def) {
    return NextResponse.json(
      errorResponse(rpcRequest.id, JSON_RPC_ERROR_METHOD_NOT_FOUND, "Tool inconnu : " + String(toolName)),
    );
  }

  if (!hasScope(grantedScope, def.requiredScope)) {
    return NextResponse.json(
      successResponse(rpcRequest.id, buildToolErrorResult(`Ce tool necessite le scope ${def.requiredScope}.`)),
    );
  }

  const parsedArgs = def.parseArgs(args);
  if ("error" in parsedArgs && typeof parsedArgs.error === "string") {
    return NextResponse.json(successResponse(rpcRequest.id, buildToolErrorResult(parsedArgs.error)));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  const timezone = (profile as ProfileTimezoneRow | null)?.timezone ?? "UTC";

  const ctx: McpContext = { supabase, userId, timezone };
  const result = await def.handler(ctx, parsedArgs);
  return NextResponse.json(successResponse(rpcRequest.id, result));
}
