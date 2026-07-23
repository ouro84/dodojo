import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyCodeChallenge } from "../../../lib/pkce";
import {
  ACCESS_TOKEN_TTL_MS,
  expiresAtFromNow,
  generateOpaqueToken,
  hashOpaqueToken,
  isExpired,
} from "../../../lib/oauth-tokens";
import { parseOAuthRequestBody } from "../../../lib/oauth-request-body";
import { createRateLimiter, extractClientIp } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Endpoint OUVERT par construction (n'importe quel client MCP peut
// echanger un code ou renouveler un token) - rate limit basique par IP,
// best-effort.
const tokenRateLimiter = createRateLimiter(10, 60_000);

interface AuthorizationCodeRow {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  expires_at: string;
}

interface OAuthTokenRow {
  id: string;
  access_token_hash: string;
  refresh_token_hash: string | null;
  client_id: string;
  user_id: string;
  scope: string;
  expires_at: string;
}

function tokenError(error: string, status: number): Response {
  return NextResponse.json({ error }, { status });
}

function serviceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

// US-22 : POST /oauth/token - echange le code d'autorisation (grant
// authorization_code, PKCE obligatoire) ou renouvelle un access_token
// (grant refresh_token). Client PUBLIC (pas de secret, cf. design) : la
// seule preuve de possession exigee est le code_verifier (PKCE).
export async function POST(request: Request): Promise<Response> {
  const ip = extractClientIp(request);
  if (!tokenRateLimiter.consume(ip).allowed) {
    return tokenError("rate_limited", 429);
  }

  let body: Record<string, string>;
  try {
    body = await parseOAuthRequestBody(request);
  } catch {
    return tokenError("invalid_request", 400);
  }

  const supabase = serviceClient();
  if (!supabase) {
    return tokenError("server_error", 500);
  }

  if (body.grant_type === "authorization_code") {
    return handleAuthorizationCodeGrant(supabase, body);
  }
  if (body.grant_type === "refresh_token") {
    return handleRefreshTokenGrant(supabase, body);
  }
  return tokenError("unsupported_grant_type", 400);
}

async function handleAuthorizationCodeGrant(
  supabase: SupabaseClient,
  body: Record<string, string>,
): Promise<Response> {
  const code = body.code;
  const codeVerifier = body.code_verifier;
  const redirectUri = body.redirect_uri;
  const clientId = body.client_id;
  if (!code || !codeVerifier || !redirectUri || !clientId) {
    return tokenError("invalid_request", 400);
  }

  const { data } = await supabase
    .from("oauth_authorization_codes")
    .select("code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, expires_at")
    .eq("code_hash", hashOpaqueToken(code))
    .maybeSingle();

  const authCode = data as AuthorizationCodeRow | null;

  // Usage unique (RFC 6749 paragraphe 4.1.2) : le code est supprime des
  // qu'on l'a lu, valide ou pas - empeche tout rejeu meme si l'echange
  // echoue ensuite pour une autre raison (client_id/redirect_uri/PKCE
  // invalides).
  if (authCode) {
    await supabase.from("oauth_authorization_codes").delete().eq("code_hash", authCode.code_hash);
  }

  if (
    !authCode ||
    authCode.client_id !== clientId ||
    authCode.redirect_uri !== redirectUri ||
    isExpired(authCode.expires_at)
  ) {
    return tokenError("invalid_grant", 400);
  }

  if (!verifyCodeChallenge(codeVerifier, authCode.code_challenge)) {
    return tokenError("invalid_grant", 400);
  }

  return issueTokenResponse(supabase, authCode.client_id, authCode.user_id, authCode.scope);
}

async function handleRefreshTokenGrant(
  supabase: SupabaseClient,
  body: Record<string, string>,
): Promise<Response> {
  const refreshToken = body.refresh_token;
  const clientId = body.client_id;
  if (!refreshToken || !clientId) {
    return tokenError("invalid_request", 400);
  }

  const { data } = await supabase
    .from("oauth_tokens")
    .select("id, access_token_hash, refresh_token_hash, client_id, user_id, scope, expires_at")
    .eq("refresh_token_hash", hashOpaqueToken(refreshToken))
    .maybeSingle();

  const existing = data as OAuthTokenRow | null;
  if (!existing || existing.client_id !== clientId) {
    return tokenError("invalid_grant", 400);
  }

  // Rotation (best practice OAuth 2.1) : l'ancien couple access/refresh est
  // supprime, un nouveau est emis - limite la fenetre d'exploitation d'un
  // refresh_token vole. Pas de TTL propre au refresh_token dans ce MVP (une
  // seule colonne expires_at par ligne, cf. schema) : il reste valide
  // jusqu'a rotation ou revocation explicite (/oauth/revoke).
  await supabase.from("oauth_tokens").delete().eq("id", existing.id);

  return issueTokenResponse(supabase, existing.client_id, existing.user_id, existing.scope);
}

async function issueTokenResponse(
  supabase: SupabaseClient,
  clientId: string,
  userId: string,
  scope: string,
): Promise<Response> {
  const accessToken = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();

  const { error } = await supabase.from("oauth_tokens").insert({
    access_token_hash: hashOpaqueToken(accessToken),
    refresh_token_hash: hashOpaqueToken(refreshToken),
    client_id: clientId,
    user_id: userId,
    scope,
    expires_at: expiresAtFromNow(ACCESS_TOKEN_TTL_MS),
  });

  if (error) {
    return tokenError("server_error", 500);
  }

  return NextResponse.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope,
  });
}
