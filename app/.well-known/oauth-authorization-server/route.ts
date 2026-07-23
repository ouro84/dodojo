import { NextResponse } from "next/server";
import { buildAuthorizationServerMetadata } from "../../../lib/oauth-metadata";

export const dynamic = "force-dynamic";

// RFC 8414 : metadonnees de decouverte du serveur d'autorisation, attendues
// par tout client MCP conforme (Gemini) avant d'entamer le flow OAuth.
export async function GET(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  return NextResponse.json(buildAuthorizationServerMetadata(origin));
}
