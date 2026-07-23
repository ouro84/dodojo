export interface ClientRegistration {
  clientName: string;
  redirectUris: string[];
}

export type ClientRegistrationValidation = { registration: ClientRegistration } | { error: string };

const DEFAULT_CLIENT_NAME = "Client MCP";
const CLIENT_NAME_MAX_LENGTH = 200;

function isValidRedirectUri(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// RFC 7591 (Dynamic Client Registration) - validation minimale : Dodojo
// accepte l'auto-enregistrement de n'importe quel client MCP (Gemini ou
// futur assistant), pas seulement un client code en dur (design US-22).
// `redirect_uris` est la seule metadonnee reellement structurante ici (le
// serveur d'autorisation doit savoir ou rediriger apres consentement) ;
// `client_name` reste informatif, jamais utilise pour une decision de
// securite (l'identification "Gemini" au QG, lib/oauth-gemini.ts, est une
// heuristique d'affichage, pas un controle d'acces).
export function validateClientRegistration(body: unknown): ClientRegistrationValidation {
  if (typeof body !== "object" || body === null) {
    return { error: "redirect_uris est requis." };
  }
  const candidate = body as Record<string, unknown>;

  const redirectUris = candidate.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return { error: "redirect_uris doit etre un tableau non vide d'URLs." };
  }
  if (!redirectUris.every(isValidRedirectUri)) {
    return { error: "Chaque redirect_uri doit etre une URL absolue valide." };
  }

  let clientName = DEFAULT_CLIENT_NAME;
  if (candidate.client_name !== undefined) {
    if (typeof candidate.client_name !== "string" || !candidate.client_name.trim()) {
      return { error: "client_name doit etre une chaine non vide." };
    }
    if (candidate.client_name.length > CLIENT_NAME_MAX_LENGTH) {
      return { error: `client_name est trop long (${CLIENT_NAME_MAX_LENGTH} caracteres max).` };
    }
    clientName = candidate.client_name.trim();
  }

  return { registration: { clientName, redirectUris: redirectUris as string[] } };
}
