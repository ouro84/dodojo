import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { login } from "./fixtures";

// Issue #201 (lot 2, socle MCP) : premier test qui exerce le handshake OAuth
// 2.1 + MCP dans son integralite (enregistrement dynamique -> consentement
// filtre par scope -> code -> token -> tools/list -> tools/call). Aucun
// client reel (Gemini) n'a jamais reussi a se connecter en pratique
// (cf. CLAUDE.md, issue #104) : ce flux n'avait donc jamais ete valide
// bout-en-bout avant ce spec.
function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}
function deriveCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

test.describe("Handshake OAuth + MCP (issue #201)", () => {
  test("enregistrement, autorisation, echange de token, tools/list filtre, add_task, tool inconnu refuse", async ({
    page,
    request,
    baseURL,
  }) => {
    // Nom prefixe "e2e-" : purgeE2eAccountState (e2e/fixtures.ts) filtre
    // oauth_clients par ce prefixe, faute de colonne user_id sur cette table.
    const clientName = `e2e-mcp-${Date.now()}`;
    const redirectUri = "http://127.0.0.1:9999/callback";

    // 1. Enregistrement dynamique (RFC 7591)
    const registerRes = await request.post(`${baseURL}/oauth/register`, {
      data: { client_name: clientName, redirect_uris: [redirectUri] },
    });
    expect(registerRes.status()).toBe(201);
    const { client_id: clientId } = await registerRes.json();
    expect(clientId).toBeTruthy();

    // 2. PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = deriveCodeChallenge(codeVerifier);

    // 3. Login puis navigation vers /oauth/authorize (session cookie du navigateur)
    await login(page);
    const authorizeUrl = new URL("/oauth/authorize", baseURL!);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    await page.goto(authorizeUrl.toString());

    // 4. Consentement affiche les scopes par defaut (tasks:read + tasks:write)
    await expect(page.getByText(/Lire tes tâches/)).toBeVisible();
    await expect(page.getByText(/Créer et cocher des tâches/)).toBeVisible();
    await expect(page.getByText(/Changer ton combattant équipé/)).not.toBeVisible();

    // 5. Autoriser -> le formulaire POST sur /oauth/authorize repond par une
    // redirection 302 vers redirect_uri?code=... . redirect_uri pointe un
    // port qui n'ecoute pas (127.0.0.1:9999) : la navigation echoue donc
    // reseau (ERR_CONNECTION_REFUSED), mais Chromium emet quand meme
    // l'evenement "request" AVANT de tenter la connexion - on le capture via
    // page.waitForRequest plutot que page.route. Tente d'abord avec
    // page.route()/route.fulfill() (intercepter avant meme la tentative
    // reseau) : le network log de trace montrait un status -1 (echec reseau
    // reel) pour cette requete precise, preuve que route() ne l'attrapait
    // pas ici - vraisemblablement parce que route.click() ne bloque pas sur
    // la navigation qui en resulte et que l'interception d'un hop de
    // redirection post-POST se comporte differemment. waitForRequest
    // observe l'evenement reseau independamment de son issue (succes ou
    // echec de connexion), ce qui est suffisant : on n'a besoin que de l'URL.
    const [redirectRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().startsWith(redirectUri)),
      page.getByRole("button", { name: "Autoriser" }).click(),
    ]);
    const code = new URL(redirectRequest.url()).searchParams.get("code");
    expect(code).toBeTruthy();

    // 6. Echange du code contre un token
    const tokenRes = await request.post(`${baseURL}/oauth/token`, {
      form: {
        grant_type: "authorization_code",
        code: code!,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id: clientId,
      },
    });
    expect(tokenRes.status()).toBe(200);
    const { access_token: accessToken } = await tokenRes.json();
    expect(accessToken).toBeTruthy();

    // 7. tools/list -> add_task visible (scope par defaut inclut tasks:write)
    const listRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.result.tools.map((t: { name: string }) => t.name)).toContain("add_task");

    // 8. add_task reussit
    const addRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "add_task", arguments: { title: `Tache MCP e2e ${Date.now()}` } },
      },
    });
    expect(addRes.status()).toBe(200);
    const addBody = await addRes.json();
    expect(addBody.result.isError).toBe(false);

    // 9. Un tool hors catalogue -> erreur JSON-RPC, jamais un 500
    const unknownRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "delete_everything", arguments: {} },
      },
    });
    expect(unknownRes.status()).toBe(200);
    const unknownBody = await unknownRes.json();
    expect(unknownBody.error).toBeTruthy();
  });
});
