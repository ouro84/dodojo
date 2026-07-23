// Les endpoints OAuth token/revoke acceptent classiquement
// application/x-www-form-urlencoded (RFC 6749 paragraphes 4.1.3/2.3), mais
// aussi application/json (tolerance courante cote clients MCP). Ne retient
// que les valeurs string (un champ non-string est ignore, jamais caste).
export async function parseOAuthRequestBody(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  const result: Record<string, string> = {};

  if (contentType.includes("application/json")) {
    const json = (await request.json()) as Record<string, unknown>;
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  }

  const form = await request.formData();
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}
