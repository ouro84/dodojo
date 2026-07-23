export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
}

// RFC 8414 : decouverte du serveur d'autorisation. origin = origine de la
// requete entrante (new URL(request.url).origin) plutot qu'une variable
// d'environnement figee - reste correct aussi bien en production
// (dodojo.vercel.app) que sur une preview Vercel (URL differente par PR).
export function buildAuthorizationServerMetadata(origin: string): AuthorizationServerMetadata {
  return {
    issuer: origin,
    authorization_endpoint: origin + "/oauth/authorize",
    token_endpoint: origin + "/oauth/token",
    registration_endpoint: origin + "/oauth/register",
    revocation_endpoint: origin + "/oauth/revoke",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
  scopes_supported: string[];
}

// RFC 9728 : pointe le client MCP vers le serveur d'autorisation qui protege
// /api/mcp.
export function buildProtectedResourceMetadata(origin: string): ProtectedResourceMetadata {
  return {
    resource: origin + "/api/mcp",
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["tasks:write"],
  };
}
