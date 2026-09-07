export interface ClientRegistration {
  clientName: string;
  redirectUris: string[];
}

export type ClientRegistrationValidation = { registration: ClientRegistration } | { error: string };

const DEFAULT_CLIENT_NAME = "Client MCP";
const CLIENT_NAME_MAX_LENGTH = 200;

// Schémas qui ne sont jamais une redirection légitime — c'était la vraie cible
// du durcissement de l'audit #67 (PR5), et elle reste en place.
const DANGEROUS_SCHEMES = new Set(["javascript:", "data:", "vbscript:", "file:", "blob:"]);

// Loopback (RFC 8252 §7.3) ET plages privées (RFC 1918 pour IPv4, RFC 4193
// `fc00::/7` pour IPv6). Les plages privées sont un ÉCART ASSUMÉ à OAuth 2.1,
// qui exige HTTPS hors loopback — décision prise le 2026-09-07 après qu'un
// client MCP auto-hébergé se soit annoncé sur `http://192.168.1.212:9119`.
//
// Ce que l'écart coûte réellement : le code d'autorisation traverse le LAN en
// clair. Ce qu'il ne coûte pas, et c'est ce qui rend l'écart tenable —
// l'intercepter ne suffit pas à en faire quoi que ce soit :
//   - PKCE **S256 obligatoire** (`app/oauth/authorize/route.ts:66` refuse tout
//     le reste) : sans le `code_verifier`, qui ne transite JAMAIS par la
//     redirection, le code n'est pas échangeable ;
//   - code à **usage unique**, supprimé à l'échange (`app/oauth/token/route.ts:110`) ;
//   - **TTL 60 s** (`AUTHORIZATION_CODE_TTL_MS`).
//
// Ne pas relâcher l'un de ces trois sans revenir sur cette décision : c'est
// leur cumul qui la justifie, pas la confiance dans le réseau local.
//
// Non couvert volontairement : les noms mDNS (`http://machin.local:9119`).
// Rien ne permet de vérifier à l'enregistrement vers quoi ils résolvent ; à
// ajouter seulement si un client réel le demande.
function isLoopbackOrPrivateHost(hostname: string): boolean {
  // `new URL("http://[::1]:8080/cb").hostname` vaut `"[::1]"`, crochets
  // compris — comparer à `"::1"` ne matcherait jamais.
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]") return true;

  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    // IPv6 unique-local : `fc00::/7`, donc premier octet `fc` ou `fd`.
    const inner = hostname.slice(1, -1).toLowerCase();
    return inner.startsWith("fc") || inner.startsWith("fd");
  }

  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!octets) return false;
  const [a, b, c, d] = octets.slice(1, 5).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

// Audit #67, PR5 : n'importe quel schéma parsable était accepté (http, voire
// javascript:/data:). Le durcissement a sur-corrigé — il n'autorisait que
// `https:` et le loopback IPv4/`localhost`, alors que RFC 8252, qu'il citait
// pourtant, décrit TROIS formes de redirection pour un client natif :
//
//   §7.1 — schéma privé (`monapp:/callback`, idéalement reverse-DNS)
//   §7.2 — https revendiqué
//   §7.3 — loopback, et « the loopback interface … MUST support both
//          127.0.0.1 and [::1] »
//
// Seules §7.2 et une moitié de §7.3 passaient. Conséquence constatée en
// branchant un vrai client MCP le 2026-09-07 : refus à l'enregistrement
// (`invalid_client_metadata`), donc serveur inutilisable par tout client
// natif — le cas d'usage même pour lequel il a été écrit.
//
// La frontière de sécurité ne repose de toute façon pas sur ce filtre :
// `/oauth/authorize` valide `redirect_uri` contre la liste enregistrée du
// client AVANT toute redirection (prévention d'open redirect, US-22), et
// l'utilisateur doit consentir. Ce filtre-ci n'a qu'à écarter les schémas
// qui ne sont jamais une redirection.
function isValidRedirectUri(value: unknown): value is string {
  if (typeof value !== "string") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (DANGEROUS_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return isLoopbackOrPrivateHost(url.hostname);
  // Tout autre schéma = schéma privé (RFC 8252 §7.1). On n'exige pas un point
  // (reverse-DNS) : la RFC le recommande, mais les clients réels utilisent
  // aussi bien `claude://` que `com.exemple.app:/`, et refuser les premiers
  // reproduirait exactement le blocage qu'on corrige ici.
  return true;
}

// RFC 7591 (Dynamic Client Registration) - validation minimale : Dodojo
// accepte l'auto-enregistrement de n'importe quel client MCP (Gemini ou
// futur assistant), pas seulement un client code en dur (design US-22).
// `redirect_uris` est la seule metadonnee reellement structurante ici (le
// serveur d'autorisation doit savoir ou rediriger apres consentement) ;
// `client_name` reste informatif, jamais utilise pour une decision de
// securite (l'identification "Gemini" au Vestiaire, lib/oauth-gemini.ts, est une
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
  // Le message nomme l'URI fautive : un refus opaque cote client ("une URL
  // absolue valide" sans dire laquelle) a coute un aller-retour de diagnostic
  // complet le 2026-09-07, cote serveur comme cote integrateur — on ne
  // journalise pas non plus le corps de la requete.
  const offending = redirectUris.find((uri) => !isValidRedirectUri(uri));
  if (offending !== undefined) {
    const shown = typeof offending === "string" ? offending : JSON.stringify(offending);
    return {
      error:
        `redirect_uri refuse : ${shown}. Attendu : https, http sur loopback ` +
        `(127.0.0.1, [::1], localhost) ou plage privee (10.x, 172.16-31.x, ` +
        `192.168.x, fc00::/7), ou un schema prive type monapp:/callback.`,
    };
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
