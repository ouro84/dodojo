import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hashOpaqueToken } from "../../../lib/oauth-tokens";
import { parseOAuthRequestBody } from "../../../lib/oauth-request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serviceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

// US-22 : POST /oauth/revoke (RFC 7009) - revocation proactive cote client
// (Gemini), ex. deconnexion initiee depuis les reglages "Connected Apps"
// plutot que depuis Le Vestiaire Dodojo. Le token soumis peut etre un access_token
// OU un refresh_token (RFC 7009 paragraphe 2.1) : les deux hashent la meme
// ligne oauth_tokens (couple emis ensemble), chercher sur les deux colonnes
// suffit a retrouver et supprimer la ligne entiere. Toujours 200, meme si
// le token est deja invalide/inconnu (RFC 7009 paragraphe 2.2 : ne jamais
// reveler si un token existait).
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, string>;
  try {
    body = await parseOAuthRequestBody(request);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const token = body.token;
  if (!token) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const hash = hashOpaqueToken(token);
  await supabase.from("oauth_tokens").delete().eq("access_token_hash", hash);
  await supabase.from("oauth_tokens").delete().eq("refresh_token_hash", hash);

  return new NextResponse(null, { status: 200 });
}
