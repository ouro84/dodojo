import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "../../../lib/supabase/server";
import { renderConsentPage, renderErrorPage } from "../../../lib/oauth-consent-page";
import {
  AUTHORIZATION_CODE_TTL_MS,
  expiresAtFromNow,
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../../lib/oauth-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OAuthClientRow {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
}

interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  state: string | null;
}

function parseAuthorizeParams(searchParams: URLSearchParams): AuthorizeParams {
  return {
    clientId: searchParams.get("client_id") ?? "",
    redirectUri: searchParams.get("redirect_uri") ?? "",
    codeChallenge: searchParams.get("code_challenge") ?? "",
    codeChallengeMethod: searchParams.get("code_challenge_method") ?? "",
    scope: searchParams.get("scope") ?? "tasks:write",
    state: searchParams.get("state"),
  };
}

async function loadClient(supabase: SupabaseClient, clientId: string): Promise<OAuthClientRow | null> {
  if (!clientId) return null;
  const { data } = await supabase
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as OAuthClientRow | null) ?? null;
}

// Valide client_id/redirect_uri/code_challenge_method AVANT toute
// redirection vers redirect_uri (RFC 6749 paragraphe 10.6 : ne jamais
// rediriger vers une URL non verifiee - prevention d'open redirect).
// Retourne le client si tout est valide, sinon une erreur affichee
// directement (jamais une redirection).
async function validateAuthorizeRequest(
  supabase: SupabaseClient,
  params: AuthorizeParams,
): Promise<{ client: OAuthClientRow } | { error: string }> {
  const client = await loadClient(supabase, params.clientId);
  if (!client) return { error: "client_id inconnu." };
  if (!params.redirectUri || !client.redirect_uris.includes(params.redirectUri)) {
    return { error: "redirect_uri non enregistre pour ce client." };
  }
  if (params.codeChallengeMethod !== "S256" || !params.codeChallenge) {
    return { error: "code_challenge_method doit etre S256 avec un code_challenge." };
  }
  return { client };
}

function errorPageResponse(message: string): Response {
  return new NextResponse(renderErrorPage(message), {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// US-22 : GET affiche l'ecran de consentement ("Gemini veut ajouter des
// taches a ta place - Autoriser ?", design) - necessite une session Dodojo
// active, sinon redirection vers /login d'abord.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params = parseAuthorizeParams(url.searchParams);

  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const nextPath = "/oauth/authorize?" + url.searchParams.toString();
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }

  const validation = await validateAuthorizeRequest(supabase, params);
  if ("error" in validation) {
    return errorPageResponse(validation.error);
  }

  const html = renderConsentPage({
    clientName: validation.client.client_name,
    scope: params.scope,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    state: params.state,
  });
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// US-22 : POST traite la decision (Autoriser/Refuser) soumise depuis
// l'ecran de consentement. Revalide TOUT cote serveur (jamais confiance
// dans les champs caches du formulaire) avant de generer le code
// d'autorisation.
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const params: AuthorizeParams = {
    clientId: String(form.get("client_id") ?? ""),
    redirectUri: String(form.get("redirect_uri") ?? ""),
    codeChallenge: String(form.get("code_challenge") ?? ""),
    codeChallengeMethod: String(form.get("code_challenge_method") ?? ""),
    scope: String(form.get("scope") ?? "tasks:write"),
    state: form.get("state") ? String(form.get("state")) : null,
  };
  const decision = String(form.get("decision") ?? "");

  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const validation = await validateAuthorizeRequest(supabase, params);
  if ("error" in validation) {
    return errorPageResponse(validation.error);
  }

  const redirectUrl = new URL(params.redirectUri);
  if (params.state) redirectUrl.searchParams.set("state", params.state);

  if (decision !== "approve") {
    redirectUrl.searchParams.set("error", "access_denied");
    return NextResponse.redirect(redirectUrl);
  }

  const code = generateOpaqueToken();
  const { error: insertError } = await supabase.from("oauth_authorization_codes").insert({
    code_hash: hashOpaqueToken(code),
    client_id: params.clientId,
    user_id: user.id,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: params.codeChallengeMethod,
    scope: params.scope,
    expires_at: expiresAtFromNow(AUTHORIZATION_CODE_TTL_MS),
  });

  if (insertError) {
    return errorPageResponse("Impossible de generer le code d'autorisation. Reessaie.");
  }

  redirectUrl.searchParams.set("code", code);
  return NextResponse.redirect(redirectUrl);
}
