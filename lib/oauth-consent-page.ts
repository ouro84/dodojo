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

// Design system Dodojo (DESIGN.md) inline plutot que via Tailwind : ce module
// rend une chaine HTML depuis un Route Handler, hors du pipeline CSS de
// l'app. Les valeurs sont donc RECOPIEES depuis app/globals.css / DESIGN.md —
// toute evolution de la palette doit repasser ici, il n'y a pas de lien
// automatique. Choix assume : voir le commentaire de renderConsentPage sur la
// contrainte "testable en Vitest sans moteur de rendu React".
//
// Regles du systeme respectees explicitement ici :
//   - fond arcade sombre en toute circonstance, jamais de light mode ;
//   - tous les neutres teintes hue 25, jamais un gris neutre pur ;
//   - BoldPixels UNIQUEMENT sur des libelles courts en majuscules
//     ("DODOJO", "AUTORISER", "REFUSER") — jamais le titre, qui est du
//     francais long et accentue (Do's and Don'ts, contrainte Satori) ;
//   - profondeur par superposition de surfaces, aucun box-shadow, aucun
//     backdrop-filter ;
//   - `hp` brut reserve aux fonds pleins et bordures ; en couleur de texte
//     sur fond neutre c'est `hp-text` (sinon sous 4.5:1).
const STYLES = `
    :root {
      --bg: oklch(0.14 0.015 25);
      --surface: oklch(0.2 0.02 25);
      --surface-2: oklch(0.17 0.018 25);
      --ink: oklch(0.96 0.01 25);
      --muted: oklch(0.66 0.02 25);
      --border: oklch(0.32 0.02 25);
      --hp: oklch(0.55 0.19 25);
      --hp-text: oklch(0.64 0.19 25);
      --gold: oklch(0.85 0.13 85);
      --alert: oklch(0.62 0.17 55);
      --xp: oklch(0.54 0.17 275);
      --mono: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
    }
    @font-face {
      font-family: "BoldPixels";
      src: url("/fonts/boldpixels.woff2") format("woff2"),
           url("/fonts/boldpixels.woff") format("woff");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--mono);
      font-size: 0.875rem;
      line-height: 1.4;
    }
    main {
      width: 100%;
      max-width: 26rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
    }
    .wordmark {
      font-family: "BoldPixels", "Courier New", monospace;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--gold);
      margin: 0 0 16px;
    }
    /* 1.25rem = plancher du pas "display" de DESIGN.md. La rampe n'a AUCUN pas
       "headline en monospace" : dans l'app, tout titre est BoldPixels et donc
       court (noms de heros/Boss, titres de section). Cet ecran est le premier
       a porter un titre francais long et accentue, que la regle
       pixel-majuscule interdit justement de mettre en BoldPixels. Vrai trou du
       systeme, signale plutot que comble en douce : on emprunte la taille du
       pas display avec la famille mono, sans inventer une valeur hors rampe.
       (Pas de backtick dans ce bloc : il vit dans un template literal.) */
    h1 {
      font-family: var(--mono);
      font-size: 1.25rem;
      font-weight: 400;
      line-height: 1.35;
      margin: 0 0 6px;
    }
    .client { color: var(--gold); }
    .lead { color: var(--muted); margin: 0 0 16px; }
    .scopes { list-style: none; margin: 0 0 16px; padding: 0; }
    .scopes li {
      background: var(--surface-2);
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 6px;
    }
    /* hp-text et non hp : sur un fond neutre (surface-2), le rouge combat brut
       tombe sous 4.5:1 — regle explicite de DESIGN.md, Do's and Don'ts.
       Attrape en REGARDANT le rendu, pas en relisant le CSS. */
    .scopes li::before {
      content: "+";
      color: var(--hp-text);
      margin-right: 8px;
    }
    .notice {
      border-left: 2px solid var(--alert);
      padding-left: 12px;
      margin: 0 0 20px;
      color: var(--muted);
      font-size: 0.875rem;
    }
    .notice strong { color: var(--ink); font-weight: 400; }
    .actions { display: flex; gap: 8px; }
    button {
      flex: 1;
      font-family: "BoldPixels", "Courier New", monospace;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      border-radius: 6px;
      padding: 10px 12px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .approve { background: var(--hp); color: var(--ink); border-color: var(--hp); }
    .deny { background: transparent; color: var(--muted); border-color: var(--border); }
    .deny:hover, .deny:focus-visible { color: var(--ink); }
    /* DESIGN.md prevoit un simple changement de couleur de texte au focus pour
       les boutons. Ecart assume ici : cet ecran n'a que deux controles et
       decide d'un acces au compte — un anneau franc vaut mieux qu'une nuance
       de gris. Un ring via box-shadow serait un box-shadow decoratif
       (interdit), donc outline — sans "outline: none" au repos qui l'annulerait
       (piege documente dans CLAUDE.md, issue #189). */
    button:focus-visible { outline: 2px solid var(--xp); outline-offset: 2px; }
    .fallback { color: var(--muted); }
`;

function renderScopeSection(scope: string): string {
  const parsed = parseScopeString(scope);
  if ("error" in parsed) {
    return '<p class="fallback">Portée demandée : ' + escapeHtml(scope) + "</p>";
  }
  if (parsed.length === 0) {
    return '<p class="fallback">Aucune portée demandée.</p>';
  }
  const items = parsed
    .map((scopeToken) => "        <li>" + escapeHtml(SCOPE_DESCRIPTIONS[scopeToken]) + "</li>")
    .join("\n");
  return [
    '<p class="lead">Cette application pourra :</p>',
    '      <ul class="scopes">',
    items,
    "      </ul>",
  ].join("\n      ");
}

function documentShell(title: string, bodyContent: string): string {
  return [
    "<!doctype html>",
    '<html lang="fr">',
    "  <head>",
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '    <meta name="robots" content="noindex" />',
    "    <title>" + title + "</title>",
    "    <style>" + STYLES + "    </style>",
    "  </head>",
    "  <body>",
    bodyContent,
    "  </body>",
    "</html>",
  ].join("\n");
}

// US-22 : ecran de consentement OAuth ("{client} veut acceder a ton compte
// Dodojo - Autoriser ?"). HTML genere cote serveur (pas de composant React :
// ce endpoint doit rester un Route Handler testable en Vitest sans moteur de
// rendu React, cf. Global Constraints du plan) — le design system est donc
// inline, cf. STYLES ci-dessus.
export function renderConsentPage(params: ConsentPageParams): string {
  const hidden = [
    hiddenField("client_id", params.clientId),
    hiddenField("redirect_uri", params.redirectUri),
    hiddenField("code_challenge", params.codeChallenge),
    hiddenField("code_challenge_method", params.codeChallengeMethod),
    hiddenField("scope", params.scope),
    hiddenField("state", params.state ?? ""),
  ].join("\n        ");

  const client = escapeHtml(params.clientName);

  return documentShell(
    "Autoriser " + client + " - Dodojo",
    [
      "    <main>",
      '      <p class="wordmark">Dodojo</p>',
      '      <h1><span class="client">' + client + "</span> veut accéder à ton compte Dodojo</h1>",
      "      " + renderScopeSection(params.scope),
      '      <p class="notice">Cette identité est déclarée par l\'application elle-même et n\'est pas vérifiée par Dodojo. <strong>N\'autorise que si tu reconnais l\'app que tu viens de connecter.</strong></p>',
      '      <form method="POST" action="/oauth/authorize">',
      "        " + hidden,
      '        <div class="actions">',
      '          <button type="submit" name="decision" value="approve" class="approve">Autoriser</button>',
      '          <button type="submit" name="decision" value="deny" class="deny">Refuser</button>',
      "        </div>",
      "      </form>",
      "    </main>",
    ].join("\n"),
  );
}

export function renderErrorPage(message: string): string {
  return documentShell(
    "Erreur d'autorisation - Dodojo",
    [
      "    <main>",
      '      <p class="wordmark">Dodojo</p>',
      "      <h1>Autorisation refusée</h1>",
      '      <p class="notice">' + escapeHtml(message) + "</p>",
      "    </main>",
    ].join("\n"),
  );
}
