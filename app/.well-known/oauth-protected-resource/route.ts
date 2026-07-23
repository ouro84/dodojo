import { NextResponse } from "next/server";
import { buildProtectedResourceMetadata } from "../../../lib/oauth-metadata";

export const dynamic = "force-dynamic";

// RFC 9728 : pointe /api/mcp vers son serveur d'autorisation. Reference
// depuis le header WWW-Authenticate d'un 401 de /api/mcp (Task 13).
export async function GET(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  return NextResponse.json(buildProtectedResourceMetadata(origin));
}
