import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateClientRegistration } from "../../../lib/oauth-client-registration";
import { createRateLimiter, extractClientIp } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 7591 : endpoint OUVERT par construction (n'importe quel client MCP
// peut s'auto-enregistrer) - rate limit basique par IP, best-effort (cf.
// lib/rate-limit.ts). 5 enregistrements/minute/IP est large pour un usage
// legitime (un client ne s'enregistre qu'une fois par appareil/install) mais
// bloque un scraping grossier.
const registerRateLimiter = createRateLimiter(5, 60_000);

interface OAuthClientRow {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
}

export async function POST(request: Request): Promise<Response> {
  const ip = extractClientIp(request);
  if (!registerRateLimiter.consume(ip).allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  const validation = validateClientRegistration(body);
  if ("error" in validation) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: validation.error },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: inserted, error } = await supabase
    .from("oauth_clients")
    .insert({
      client_name: validation.registration.clientName,
      redirect_uris: validation.registration.redirectUris,
    })
    .select("client_id, client_name, redirect_uris")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  const client = inserted as OAuthClientRow;

  // Client PUBLIC (PKCE seul, pas de secret) - cf. design : "client public,
  // pas de secret necessaire s'il utilise PKCE".
  return NextResponse.json(
    {
      client_id: client.client_id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201 },
  );
}
