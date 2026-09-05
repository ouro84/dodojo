import type { OAuthScope } from "./oauth-scopes";
import { parseScopeString } from "./oauth-scopes";

export interface ConsentPageParams {
  clientName: string;
  scope: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hiddenField(name: string, value: string): string {
  return '<input type="hidden" name="' + escapeHtml(name) + '" value="' + escapeHtml(value) + '" />';
}

// Task 4 (issue #201, lot 2) : la liste de droits affichee est derivee du
// scope reellement demande, pas un texte generique. Une ligne par scope
// accorde (SCOPE_DESCRIPTIONS), jamais la portee brute - sauf repli
// defensif si parseScopeString echoue (ne devrait plus arriver une fois le
// scope valide en amont par app/oauth/authorize/route.ts, mais ce module
// ne doit jamais planter sur une entree malformee).
const SCOPE_DESCRIPTIONS: Record<OAuthScope, string> = {
  "tasks:read": "Lire tes tâches, ton Boss et ta série",
  "tasks:write": "Créer et cocher des tâches",
  "profile:read": "Voir ta progression",
  "profile:write": "Changer ton combattant équipé",
};

function renderScopeSection(scope: string): string {
  const parsed = parseScopeString(scope);
  if ("error" in parsed) {
    return "<p>Portée demandée : " + escapeHtml(scope) + "</p>";
  }
  if (parsed.length === 0) {
    return "<p>Aucune portée demandée.</p>";
  }
  const items = parsed
    .map((scopeToken) => "        <li>" + escapeHtml(SCOPE_DESCRIPTIONS[scopeToken]) + "</li>")
    .join("\n");
  return ["<p>Cette application pourra :</p>", "      <ul>", items, "      </ul>"].join("\n      ");
}

// US-22 : ecran de consentement OAuth (design : "{client} veut acceder a ton
// compte Dodojo - Autoriser ?"). HTML minimal genere cote serveur (pas de
// composant React : ce endpoint doit rester un Route Handler testable en
// Vitest sans moteur de rendu React, cf. Global Constraints du plan).
export function renderConsentPage(params: ConsentPageParams): string {
  const hidden = [
    hiddenField("client_id", params.clientId),
    hiddenField("redirect_uri", params.redirectUri),
    hiddenField("code_challenge", params.codeChallenge),
    hiddenField("code_challenge_method", params.codeChallengeMethod),
    hiddenField("scope", params.scope),
    hiddenField("state", params.state ?? ""),
  ].join("\n        ");

  return [
    "<!doctype html>",
    '<html lang="fr">',
    "  <head>",
    '    <meta charset="utf-8" />',
    "    <title>Autoriser " + escapeHtml(params.clientName) + " - Dodojo</title>",
    "  </head>",
    "  <body>",
    "    <main>",
    "      <h1>" + escapeHtml(params.clientName) + " veut accéder à ton compte Dodojo</h1>",
    "      " + renderScopeSection(params.scope),
    "      <p>Cette identité est déclarée par l'application elle-même et n'est pas vérifiée par Dodojo. N'autorise que si tu reconnais l'app que tu viens de connecter.</p>",
    '      <form method="POST" action="/oauth/authorize">',
    "        " + hidden,
    '        <button type="submit" name="decision" value="approve">Autoriser</button>',
    '        <button type="submit" name="decision" value="deny">Refuser</button>',
    "      </form>",
    "    </main>",
    "  </body>",
    "</html>",
  ].join("\n");
}

export function renderErrorPage(message: string): string {
  return [
    "<!doctype html>",
    '<html lang="fr">',
    "  <head><meta charset=\"utf-8\" /><title>Erreur d'autorisation - Dodojo</title></head>",
    "  <body><main><h1>Autorisation refusée</h1><p>" + escapeHtml(message) + "</p></main></body>",
    "</html>",
  ].join("\n");
}
