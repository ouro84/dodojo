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

// Revue #201 (lot 6, finding 3) : le texte de retour d'add_task
// (buildAddTaskToolResult) porte desormais l'id de la tache creee
// ("Tache ajoutee (id <uuid>) pour le ..."), comme addSubtaskForUser le
// faisait deja - plus besoin de repasser par list_tasks pour l'obtenir.
function extractTaskIdFromAddResult(addResultText: string): string {
  const match = addResultText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  if (!match) {
    throw new Error(`extractTaskIdFromAddResult : aucun UUID trouve dans : "${addResultText}"`);
  }
  return match[0];
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
    // .toHaveCount(0) plutot que .not.toBeVisible() : un locator a zero
    // element matche vacuously .not.toBeVisible() (rien n'est visible car
    // rien n'existe) - ca ne prouve pas que le scope profile:write a bien
    // ete exclu, seulement que la chaine ne serait pas visible si elle
    // existait. toHaveCount(0) affirme l'absence reelle du noeud.
    await expect(page.getByText(/Changer ton combattant équipé/)).toHaveCount(0);

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
    const taskTitle = `Tache MCP e2e ${Date.now()}`;
    const addRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "add_task", arguments: { title: taskTitle } },
      },
    });
    expect(addRes.status()).toBe(200);
    const addBody = await addRes.json();
    expect(addBody.result.isError).toBe(false);
    expect(addBody.result.content[0].text).toContain("id ");

    // Lot 3 : les tools de lecture repondent avec le scope par defaut
    const listTasksRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 10, method: "tools/call",
        params: { name: "list_tasks", arguments: {} },
      },
    });
    const listTasksBody = await listTasksRes.json();
    expect(listTasksBody.result.isError).toBe(false);
    // la tache creee juste avant par add_task doit apparaitre
    expect(listTasksBody.result.content[0].text).toContain(taskTitle);

    const bossRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 11, method: "tools/call",
        params: { name: "get_boss_status", arguments: {} },
      },
    });
    expect((await bossRes.json()).result.isError).toBe(false);

    // Lot 4 (issue #201) : aller-retour d'ecriture complet, pas seulement de
    // la lecture. complete_task cible la tache creee par add_task un peu plus
    // haut - premiere preuve qu'un agent MCP peut faire AVANCER le combat, pas
    // seulement le consulter. Revue lot 6 (finding 3) : l'id vient desormais
    // directement de la reponse add_task, plus besoin de repasser par
    // list_tasks pour l'obtenir.
    const taskId = extractTaskIdFromAddResult(addBody.result.content[0].text);

    const completeRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 20, method: "tools/call",
        params: { name: "complete_task", arguments: { task_id: taskId } },
      },
    });
    const completeBody = await completeRes.json();
    expect(completeBody.result.isError).toBe(false);
    // Revue #201 (lot 6, finding 2) : "cochée" est aussi une sous-chaîne de
    // "décochée" - sous-chaîne non-ambiguë avec l'espace qui précède.
    expect(completeBody.result.content[0].text).toContain("Tâche cochée.");

    // include_completed: false -> la tache cochee juste au-dessus a disparu
    // de la liste active.
    const listActiveOnlyRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 21, method: "tools/call",
        params: { name: "list_tasks", arguments: { include_completed: false } },
      },
    });
    const listActiveOnlyBody = await listActiveOnlyRes.json();
    expect(listActiveOnlyBody.result.isError).toBe(false);
    expect(listActiveOnlyBody.result.content[0].text).not.toContain(taskTitle);

    // set_deadline : fixe une deadline sur une nouvelle tache, puis l'efface
    // (deadline_at: null). Deux appels distincts pour verifier a la fois la
    // pose et l'effacement, sans dependre de l'etat laisse par complete_task.
    const deadlineTaskTitle = `Tache MCP e2e deadline ${Date.now()}`;
    const addDeadlineTaskRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 22, method: "tools/call",
        params: { name: "add_task", arguments: { title: deadlineTaskTitle } },
      },
    });
    const deadlineTaskId = extractTaskIdFromAddResult(
      (await addDeadlineTaskRes.json()).result.content[0].text,
    );

    const deadlineIso = new Date(Date.now() + 3_600_000).toISOString();
    const setDeadlineRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 24, method: "tools/call",
        params: { name: "set_deadline", arguments: { task_id: deadlineTaskId, deadline_at: deadlineIso } },
      },
    });
    const setDeadlineBody = await setDeadlineRes.json();
    expect(setDeadlineBody.result.isError).toBe(false);
    expect(setDeadlineBody.result.content[0].text).toContain("Deadline fixée");

    const clearDeadlineRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 25, method: "tools/call",
        params: { name: "set_deadline", arguments: { task_id: deadlineTaskId, deadline_at: null } },
      },
    });
    const clearDeadlineBody = await clearDeadlineRes.json();
    expect(clearDeadlineBody.result.isError).toBe(false);
    expect(clearDeadlineBody.result.content[0].text).toContain("Deadline effacée");

    // move_task : aujourd'hui -> demain -> encore demain (idempotent, PAS une
    // erreur) -> aujourd'hui. move_task diagnostique desormais task_not_found/
    // task_abandoned/task_completed pour de vrais echecs ; deplacer une tache
    // deja a la destination demandee est un succes no-op explicite (cf.
    // CLAUDE.md, issue #201 lot 4) - un appelant qui s'attendrait a une erreur
    // sur le second appel testerait le mauvais contrat.
    const moveTaskTitle = `Tache MCP e2e move ${Date.now()}`;
    const addMoveTaskRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 26, method: "tools/call",
        params: { name: "add_task", arguments: { title: moveTaskTitle } },
      },
    });
    const moveTaskId = extractTaskIdFromAddResult((await addMoveTaskRes.json()).result.content[0].text);

    const moveToTomorrowRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 28, method: "tools/call",
        params: { name: "move_task", arguments: { task_id: moveTaskId, to: "tomorrow" } },
      },
    });
    expect((await moveToTomorrowRes.json()).result.isError).toBe(false);

    const listTomorrowRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 29, method: "tools/call",
        params: { name: "list_tasks", arguments: { day: "tomorrow" } },
      },
    });
    expect((await listTomorrowRes.json()).result.content[0].text).toContain(moveTaskTitle);

    // Deuxieme appel, meme destination : succes idempotent explicite.
    const moveToTomorrowAgainRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 30, method: "tools/call",
        params: { name: "move_task", arguments: { task_id: moveTaskId, to: "tomorrow" } },
      },
    });
    const moveAgainBody = await moveToTomorrowAgainRes.json();
    expect(moveAgainBody.result.isError).toBe(false);
    expect(moveAgainBody.result.content[0].text).toContain("déjà sur demain");

    const moveBackRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 31, method: "tools/call",
        params: { name: "move_task", arguments: { task_id: moveTaskId, to: "today" } },
      },
    });
    expect((await moveBackRes.json()).result.isError).toBe(false);

    // equip_hero requiert profile:write (D2 du spec) : le scope par defaut
    // ("tasks:read tasks:write") ne l'accorde JAMAIS - ni visible dans
    // tools/list, ni appelable via tools/call. Le round explicite scope=
    // profile:write qui prouve l'autre sens vit dans son propre test
    // ci-dessous (l'autorisation ne peut se faire qu'une fois par round).
    expect(listBody.result.tools.map((t: { name: string }) => t.name)).not.toContain("equip_hero");

    const equipDefaultScopeRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 32, method: "tools/call",
        params: { name: "equip_hero", arguments: { hero_id: "fire_knight" } },
      },
    });
    const equipDefaultScopeBody = await equipDefaultScopeRes.json();
    expect(equipDefaultScopeBody.error).toBeUndefined();
    expect(equipDefaultScopeBody.result.isError).toBe(true);

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

  // Le test precedent autorise sans parametre scope -> DEFAULT_SCOPE
  // ("tasks:read tasks:write") inclut deja tasks:write, le scope requis par
  // add_task : verifier que add_task est present ne prouve donc rien sur le
  // filtrage par scope lui-meme (une regression qui renverrait le registre
  // entier sans filtrer passerait cette assertion a l'identique). Ce
  // deuxieme round demande explicitement scope=tasks:read SEUL et verifie
  // le negatif sur les trois surfaces pilotees par le scope : consentement,
  // tools/list, tools/call.
  test("scope=tasks:read seul : consentement, tools/list et tools/call excluent add_task", async ({
    page,
    request,
    baseURL,
  }) => {
    const clientName = `e2e-mcp-scope-${Date.now()}`;
    const redirectUri = "http://127.0.0.1:9999/callback";

    const registerRes = await request.post(`${baseURL}/oauth/register`, {
      data: { client_name: clientName, redirect_uris: [redirectUri] },
    });
    expect(registerRes.status()).toBe(201);
    const { client_id: clientId } = await registerRes.json();
    expect(clientId).toBeTruthy();

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = deriveCodeChallenge(codeVerifier);

    await login(page);
    const authorizeUrl = new URL("/oauth/authorize", baseURL!);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("scope", "tasks:read");
    await page.goto(authorizeUrl.toString());

    // Consentement : seule la description tasks:read doit apparaitre.
    await expect(page.getByText(/Lire tes tâches/)).toBeVisible();
    await expect(page.getByText(/Créer et cocher des tâches/)).toHaveCount(0);

    const [redirectRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().startsWith(redirectUri)),
      page.getByRole("button", { name: "Autoriser" }).click(),
    ]);
    const code = new URL(redirectRequest.url()).searchParams.get("code");
    expect(code).toBeTruthy();

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

    // tools/list : add_task requiert tasks:write, non accorde -> absent. Les 3
    // tools de lecture qui ne requierent que tasks:read (lot 3) sont en
    // revanche bien exposes ; get_progression/list_heroes (profile:read,
    // non accorde) restent absents.
    const listRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    const toolNames = listBody.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toEqual(["list_tasks", "get_boss_status", "get_streak"]);

    // tools/call sur add_task quand meme : erreur metier dans l'enveloppe
    // JSON-RPC de succes (isError: true), jamais une erreur de transport
    // JSON-RPC (-326xx) ni un 500 - cf. handleToolsCall (app/api/mcp/route.ts).
    const callRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "add_task", arguments: { title: `Tache MCP e2e scope refuse ${Date.now()}` } },
      },
    });
    expect(callRes.status()).toBe(200);
    const callBody = await callRes.json();
    expect(callBody.error).toBeUndefined();
    expect(callBody.result.isError).toBe(true);

    // complete_task requiert aussi tasks:write, meme refus que add_task -
    // task_id absent n'a pas d'importance : le garde de scope (hasScope) est
    // verifie AVANT parseArgs cote route (app/api/mcp/route.ts), donc ce refus
    // n'a rien a voir avec la validation des arguments.
    const completeRefusedRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0",
        id: 13,
        method: "tools/call",
        params: { name: "complete_task", arguments: {} },
      },
    });
    expect(completeRefusedRes.status()).toBe(200);
    const completeRefusedBody = await completeRefusedRes.json();
    expect(completeRefusedBody.error).toBeUndefined();
    expect(completeRefusedBody.result.isError).toBe(true);

    // Premiere assertion croisee entre deux familles de scopes : tasks:read
    // voit list_tasks mais pas get_progression (requiert profile:read, non
    // accorde ici).
    const progRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 12, method: "tools/call",
        params: { name: "get_progression", arguments: {} },
      },
    });
    expect(progRes.status()).toBe(200);
    const progBody = await progRes.json();
    expect(progBody.error).toBeUndefined();
    expect(progBody.result.isError).toBe(true);
  });

  // Autre sens de la meme garantie D2 : un client qui demande explicitement
  // profile:write l'obtient, et RIEN d'autre (le scope demande remplace le
  // defaut, il ne s'y ajoute pas - cf. lib/oauth-scopes.ts). Round
  // d'autorisation dedie : un scope ne peut se negocier qu'une fois par
  // exchange de code, donc ce cas ne peut pas partager le round du premier test.
  test("scope=profile:write explicite : equip_hero seul expose et autorise", async ({
    page,
    request,
    baseURL,
  }) => {
    const clientName = `e2e-mcp-equip-${Date.now()}`;
    const redirectUri = "http://127.0.0.1:9999/callback";

    const registerRes = await request.post(`${baseURL}/oauth/register`, {
      data: { client_name: clientName, redirect_uris: [redirectUri] },
    });
    expect(registerRes.status()).toBe(201);
    const { client_id: clientId } = await registerRes.json();
    expect(clientId).toBeTruthy();

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = deriveCodeChallenge(codeVerifier);

    await login(page);
    const authorizeUrl = new URL("/oauth/authorize", baseURL!);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("scope", "profile:write");
    await page.goto(authorizeUrl.toString());

    // Consentement : seule la ligne profile:write, aucune des lectures.
    await expect(page.getByText(/Changer ton combattant équipé/)).toBeVisible();
    await expect(page.getByText(/Lire tes tâches/)).toHaveCount(0);
    await expect(page.getByText(/Créer et cocher des tâches/)).toHaveCount(0);

    const [redirectRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().startsWith(redirectUri)),
      page.getByRole("button", { name: "Autoriser" }).click(),
    ]);
    const code = new URL(redirectRequest.url()).searchParams.get("code");
    expect(code).toBeTruthy();

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

    // tools/list : equip_hero SEUL - aucune des 9 autres entrees du registre,
    // ni meme get_progression/list_heroes (profile:read, non demande ici).
    const listRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(listRes.status()).toBe(200);
    const toolNames = (await listRes.json()).result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toEqual(["equip_hero"]);

    // fire_knight est possede par defaut sur le compte e2e (offert a
    // l'onboarding, US-29 ; purgeE2eAccountState le reseme systematiquement,
    // cf. e2e/fixtures.ts) - succes attendu sans seed supplementaire.
    const equipRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "equip_hero", arguments: { hero_id: "fire_knight" } },
      },
    });
    expect(equipRes.status()).toBe(200);
    const equipBody = await equipRes.json();
    expect(equipBody.error).toBeUndefined();
    expect(equipBody.result.isError).toBe(false);
    expect(equipBody.result.content[0].text).toContain("Combattant équipé");
  });
});
