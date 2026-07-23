import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { insertTaskForUser } from "../../../lib/task-insertion";
import { validateTaskTitle } from "../../../lib/task-title";
import { hashOpaqueToken, isExpired } from "../../../lib/oauth-tokens";
import {
  ADD_TASK_TOOL,
  buildAddTaskToolResult,
  buildInitializeResult,
  buildToolErrorResult,
  buildToolsListResult,
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

// US-22 : serveur MCP (Resource Server), transport Streamable HTTP - un
// seul tool expose, add_task. Verifie le Bearer token contre oauth_tokens
// (hash + expiration) puis delegue STRICTEMENT a insertTaskForUser
// (lib/task-insertion.ts, US-03) : meme logique d'insertion + recalcul HP
// (RG-01/RG-02) que le formulaire in-app et le webhook Siri, jamais
// dupliquee.
export async function POST(request: Request): Promise<Response> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized(request);

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const { data: tokenRow } = await supabase
    .from("oauth_tokens")
    .select("user_id, expires_at")
    .eq("access_token_hash", hashOpaqueToken(token))
    .maybeSingle();

  const resolvedToken = tokenRow as OAuthTokenRow | null;
  if (!resolvedToken || isExpired(resolvedToken.expires_at)) {
    return unauthorized(request);
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
    return NextResponse.json(successResponse(rpcRequest.id, buildToolsListResult()));
  }
  if (rpcRequest.method === "tools/call") {
    return handleToolsCall(supabase, resolvedToken.user_id, rpcRequest);
  }

  return NextResponse.json(
    errorResponse(rpcRequest.id, JSON_RPC_ERROR_METHOD_NOT_FOUND, "Methode inconnue : " + rpcRequest.method),
  );
}

async function handleToolsCall(
  supabase: SupabaseClient,
  userId: string,
  rpcRequest: JsonRpcRequest,
): Promise<Response> {
  const toolName = rpcRequest.params?.name;
  const args = (rpcRequest.params?.arguments as Record<string, unknown> | undefined) ?? {};

  if (toolName !== ADD_TASK_TOOL.name) {
    return NextResponse.json(
      errorResponse(rpcRequest.id, JSON_RPC_ERROR_METHOD_NOT_FOUND, "Tool inconnu : " + String(toolName)),
    );
  }

  const rawTitle = args.title;
  if (typeof rawTitle !== "string") {
    return NextResponse.json(successResponse(rpcRequest.id, buildToolErrorResult("title est requis (string).")));
  }

  const validation = validateTaskTitle(rawTitle);
  if ("error" in validation) {
    return NextResponse.json(successResponse(rpcRequest.id, buildToolErrorResult(validation.error)));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  const timezone = (profile as ProfileTimezoneRow | null)?.timezone ?? "UTC";

  try {
    const outcome = await insertTaskForUser(supabase, { userId, title: validation.title, timezone });
    return NextResponse.json(successResponse(rpcRequest.id, buildAddTaskToolResult(outcome)));
  } catch {
    return NextResponse.json(successResponse(rpcRequest.id, buildToolErrorResult("insert_task_failed")));
  }
}
