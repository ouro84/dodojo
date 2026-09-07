import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hashOpaqueToken, isExpired } from "../../../lib/oauth-tokens";
import { consumeMcpQuota } from "../../../lib/mcp-rate-limit";
import { createRateLimiter, extractClientIp } from "../../../lib/rate-limit";
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
  type McpToolResult,
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

// Defense en profondeur, couche 1 : garde IP en memoire (best-effort, cf.
// lib/rate-limit.ts), avant meme de savoir si le Bearer token est valide -
// symetrique a /oauth/register (5/min/IP) et /oauth/token (10/min/IP). Sans
// elle, un attaquant envoyant des tokens invalides declenche un SELECT
// Supabase indexe par requete a n'importe quel debit, sans jamais atteindre
// le quota autoritaire par utilisateur (consumeMcpQuota), qui par
// construction ne peut s'appliquer qu'une fois l'utilisateur identifie.
const mcpRateLimiter = createRateLimiter(60, 60_000);

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
  if (!mcpRateLimiter.consume(extractClientIp(request)).allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

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
    // `id` est force a null : le corps de la requete n'a volontairement pas
    // encore ete parse a ce stade (le parser plus bas), donc aucun id
    // JSON-RPC n'est disponible - le parser APRES ce guard reviendrait a
    // laisser un appelant contourner le quota en forcant un corps invalide.
    return NextResponse.json(errorResponse(null, JSON_RPC_ERROR_INVALID_PARAMS, "rate_limited"), {
      status: 429,
      headers: { "Retry-After": "60" },
    });
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
    // Revue #201 (lot 6, finding 4) : convention `<code> : <phrase>` unifiee
    // par lib/mcp-tools.ts (DOMAIN_ERROR_PHRASES) mais jamais retrofittee ici
    // — ce refus de scope, l'un des deux que rencontre le plus souvent un
    // agent, renvoyait une prose sans code stable a brancher. `scope_denied`
    // n'est volontairement PAS ajoute a DomainErrorCode : ce n'est pas une
    // erreur du domaine, seulement la meme FORME de surface.
    return NextResponse.json(
      successResponse(
        rpcRequest.id,
        buildToolErrorResult(`scope_denied : ce tool necessite le scope ${def.requiredScope}.`),
      ),
    );
  }

  const parsed = def.parseArgs(args);
  if (!parsed.ok) {
    return NextResponse.json(successResponse(rpcRequest.id, buildToolErrorResult(parsed.error)));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  const timezone = (profile as ProfileTimezoneRow | null)?.timezone ?? "UTC";

  const ctx: McpContext = { supabase, userId, timezone };
  // Revue finale PR #205, fix 1 : un throw non rattrape ici (panne Supabase,
  // ou RangeError d'Intl si `profiles.timezone` est un IANA invalide - captee
  // cote navigateur a l'onboarding, jamais validee serveur) fuyait en HTTP
  // 500 sans enveloppe JSON-RPC. D6.3 du spec veut qu'une erreur metier reste
  // une reponse in-band (`isError: true`), jamais une panne de transport - un
  // agent qui recoit un -326xx ou un 500 nu conclut que le serveur est casse
  // et abandonne. Garde posee ici (niveau route), pas par handler : couvre
  // aussi les tools d'ecriture d'un futur lot sans dupliquer de try/catch.
  let result: McpToolResult;
  try {
    result = await def.handler(ctx, parsed.args);
  } catch {
    // Revue #201 (lot 6, finding 4) : "internal_error" nu n'est pas un membre
    // de DomainErrorCode (le "code nu sans phrase" que ce lot corrige partout
    // ailleurs) — meme forme `<code> : <phrase>` que le reste des tools, sans
    // pour autant forcer ce code dans DomainErrorCode (ce n'est pas une erreur
    // du domaine, seulement un throw non rattrape par le handler).
    result = buildToolErrorResult("internal_error : erreur interne du serveur MCP.");
  }
  return NextResponse.json(successResponse(rpcRequest.id, result));
}
