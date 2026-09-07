import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADD_TASK_TOOL,
  buildAddTaskToolResult,
  buildToolErrorResult,
  type McpTool,
  type McpToolResult,
} from "./mcp-protocol";
import { insertTaskForUser } from "./task-insertion";
import { validateTaskTitle } from "./task-title";
import { hasScope, type OAuthScope } from "./oauth-scopes";
import { completeTaskForUser, listTasksForUser, setTaskDeadlineForUser, userToday } from "./domain/tasks";
import { readStreak } from "./domain/streak";
import { readBossStatus } from "./domain/boss";
import { readHeroRoster } from "./domain/heroes";
import { readProgression } from "./domain/progression";
import { localTimeFromIso, nextDayKey } from "./game-engine";
import { getHero } from "./heroes";
import type { DomainErrorCode } from "./domain/errors";

export interface McpContext {
  supabase: SupabaseClient;
  userId: string;
  timezone: string;
}

// Union discriminee : un `Record<string, unknown>` peut structurellement
// contenir une cle `error`, donc l'ancienne forme
// `Record<string, unknown> | { error: string }` n'etait pas vraiment
// discriminante (cf. revues lots 1/2) — forcait un garde
// `typeof parsedArgs.error === "string"` cote route.ts, disparu avec ce type.
export type ParsedArgs<T> = { ok: true; args: T } | { ok: false; error: string };

export interface McpToolDef {
  tool: McpTool;
  requiredScope: OAuthScope;
  parseArgs: (args: Record<string, unknown>) => ParsedArgs<Record<string, unknown>>;
  handler: (ctx: McpContext, args: Record<string, unknown>) => Promise<McpToolResult>;
}

// Issue #201 (lot 4, tache 3) : convention unifiee pour TOUT message d'erreur
// de tool MCP - `<code machine> : <phrase courte>`. Avant ce lot, trois sites
// emettaient un code nu (cf. retrofits ci-dessous) : un agent devait deviner
// le sens, une phrase seule sans code ne lui donne rien de stable a brancher.
// `Record<DomainErrorCode, string>` plutot qu'une chaine de `if` : exhaustif
// sur l'union fermee, un futur code ajoute a DomainErrorCode fait echouer la
// compilation ici plutot que de retomber silencieusement dans un defaut.
// Phrases courtes et factuelles - le registre "voix" (lib/copy/) ne concerne
// pas cette surface machine-facing.
const DOMAIN_ERROR_PHRASES: Record<DomainErrorCode, string> = {
  invalid_task_id: "identifiant de tâche invalide",
  invalid_title: "titre de tâche invalide",
  task_not_found: "tâche introuvable",
  task_abandoned: "tâche abandonnée",
  depth_limit: "une sous-tâche ne peut pas avoir de sous-tâches",
  fetch_failed: "échec de lecture en base",
  insert_failed: "échec de création en base",
  update_failed: "échec de mise à jour en base",
  profile_not_found: "profil introuvable",
  hero_not_found: "héros introuvable au catalogue",
  hero_not_owned: "héros non débloqué",
  skin_not_found: "tenue introuvable au catalogue",
  skin_not_owned: "tenue non débloquée",
};

function withCode(code: string, phrase: string): string {
  return `${code} : ${phrase}`;
}

function domainErrorMessage(code: DomainErrorCode): string {
  return withCode(code, DOMAIN_ERROR_PHRASES[code]);
}

function parseAddTaskArgs(args: Record<string, unknown>): ParsedArgs<Record<string, unknown>> {
  const rawTitle = args.title;
  if (typeof rawTitle !== "string") {
    // Fix (lot 4, tache 3 - revue finding 6) : ce site (pre-lot) emettait un
    // code nu, contrairement aux parseurs ajoutes par ce lot - la convention
    // "invalid_args : <phrase>" n'etait donc pas vraiment unifiee.
    return { ok: false, error: "invalid_args : title est requis (string)." };
  }
  return { ok: true, args: { title: rawTitle } };
}

async function handleAddTask(ctx: McpContext, args: Record<string, unknown>): Promise<McpToolResult> {
  const validation = validateTaskTitle(args.title as string);
  if ("error" in validation) {
    // Retrofit (lot 4, tache 3) : validateTaskTitle renvoie deja une phrase
    // francaise (vide/trop long) - on la prefixe du code "invalid_title" au
    // lieu de la remplacer, pour garder le detail tout en unifiant le format.
    return buildToolErrorResult(withCode("invalid_title", validation.error));
  }

  try {
    const outcome = await insertTaskForUser(ctx.supabase, {
      userId: ctx.userId,
      title: validation.title,
      timezone: ctx.timezone,
    });
    return buildAddTaskToolResult(outcome);
  } catch (err) {
    // Retrofit (lot 4, tache 3) : ce site emettait la chaine litterale
    // "insert_task_failed", qui n'est meme pas un membre de DomainErrorCode
    // (le plus proche est "insert_failed") - corrige au passage.
    // Fix (lot 4, tache 3 - revue finding 5) : insertTaskForUser
    // (lib/task-insertion.ts) leve deux erreurs distinctes -
    // "insert_task_fetch_failed" (lecture des taches du jour echouee) et
    // "insert_task_failed" (l'insertion elle-meme) - les conflater en
    // "insert_failed" cache a l'agent qu'une simple LECTURE a echoue avant
    // meme la tentative d'ecriture.
    const code =
      err instanceof Error && err.message.endsWith("fetch_failed") ? "fetch_failed" : "insert_failed";
    return buildToolErrorResult(domainErrorMessage(code));
  }
}

// Registry extensible : lot 3 (lecture) ajoute ses entrees ici, jamais une
// nouvelle chaine de if dans app/api/mcp/route.ts.
const LIST_TASKS_TOOL: McpTool = {
  name: "list_tasks",
  description:
    "Liste les tâches Dodojo d'une journée (aujourd'hui par défaut), triées comme dans l'Arène.",
  inputSchema: {
    type: "object",
    properties: {
      day: { type: "string", description: "'today' (défaut) ou 'tomorrow'" },
      include_completed: { type: "boolean", description: "Inclure les tâches déjà cochées (défaut : true)" },
    },
    required: [],
  },
};

const GET_BOSS_STATUS_TOOL: McpTool = {
  name: "get_boss_status",
  description: "Donne le Boss du jour et ses HP restants.",
  inputSchema: { type: "object", properties: {}, required: [] },
};

const GET_STREAK_TOOL: McpTool = {
  name: "get_streak",
  description: "Donne la série de victoires en cours et les jokers restants de la semaine.",
  inputSchema: { type: "object", properties: {}, required: [] },
};

const GET_PROGRESSION_TOOL: McpTool = {
  name: "get_progression",
  description: "Donne le niveau, l'XP, l'XP restante avant le niveau suivant et l'or.",
  inputSchema: { type: "object", properties: {}, required: [] },
};

const LIST_HEROES_TOOL: McpTool = {
  name: "list_heroes",
  description: "Liste les combattants du catalogue, lesquels sont débloqués et lequel est équipé.",
  inputSchema: { type: "object", properties: {}, required: [] },
};

const COMPLETE_TASK_TOOL: McpTool = {
  name: "complete_task",
  description: "Coche (ou décoche) une tâche Dodojo et inflige les dégâts au Boss du jour.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Identifiant de la tâche (UUID, donné par list_tasks)" },
      completed: { type: "boolean", description: "true pour cocher (défaut), false pour décocher" },
    },
    required: ["task_id"],
  },
};

const SET_DEADLINE_TOOL: McpTool = {
  name: "set_deadline",
  description: "Fixe, modifie ou efface l'heure limite d'une tâche.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Identifiant de la tâche (UUID)" },
      // Fix (lot 4, tache 3 - revue finding 2) : `type: "string"` seul
      // interdisait `null` a un client qui valide ses arguments contre ce
      // schema avant d'appeler le tool - "effacer la deadline" devenait alors
      // inatteignable malgre un parseur qui l'accepte deja.
      deadline_at: {
        type: ["string", "null"],
        description: "Instant ISO 8601 (UTC), ou null pour effacer",
      },
      reminder_enabled: { type: "boolean", description: "Activer/désactiver le rappel push pour cette tâche (omis = inchangé)" },
      reminder_offset_minutes: { type: "number", description: "Minutes avant la deadline pour le rappel (omis = inchangé)" },
    },
    required: ["task_id", "deadline_at"],
  },
};

function parseListTasksArgs(args: Record<string, unknown>): ParsedArgs<Record<string, unknown>> {
  const day = args.day ?? "today";
  if (day !== "today" && day !== "tomorrow") {
    // Fix (lot 4, tache 3 - revue finding 6) : meme retrofit que
    // parseAddTaskArgs ci-dessus - site pre-lot, code nu jusqu'ici.
    return { ok: false, error: "invalid_args : day doit valoir 'today' ou 'tomorrow'." };
  }
  const rawInclude = args.include_completed;
  const includeCompleted = rawInclude === undefined ? true : rawInclude === "true" || rawInclude === true;
  return { ok: true, args: { day, includeCompleted } };
}

async function handleListTasks(ctx: McpContext, args: Record<string, unknown>): Promise<McpToolResult> {
  const today = await userToday(ctx.supabase, ctx.userId);
  const dayDate = args.day === "tomorrow" ? nextDayKey(today) : today;
  const includeCompleted = args.includeCompleted === true;
  const tasks = await listTasksForUser(ctx.supabase, ctx.userId, dayDate, includeCompleted);

  if (tasks.length === 0) {
    // Revue #201 (fix round 1) : `tasks` est déjà filtré par includeCompleted
    // (listTasksForUser filtre AVANT de renvoyer) — un tableau vide ici ne
    // veut donc pas forcément dire "rien pour ce jour". Si le filtre est actif
    // (includeCompleted=false), il peut aussi vouloir dire "tout est déjà
    // fait, cf. la vraie liste sans filtre" — les deux messages sont
    // trompeurs l'un pour l'autre, jamais interchangeables pour un agent qui
    // relaie le texte tel quel à l'utilisateur.
    if (!includeCompleted) {
      const withCompleted = await listTasksForUser(ctx.supabase, ctx.userId, dayDate, true);
      if (withCompleted.length > 0) {
        return {
          content: [{
            type: "text",
            text: `Aucune tâche active pour le ${dayDate} — tout est déjà fait !`,
          }],
          isError: false,
        };
      }
    }
    return { content: [{ type: "text", text: `Aucune tâche pour le ${dayDate}.` }], isError: false };
  }

  const lines = tasks.map((t) => {
    const box = t.isCompleted ? "[x]" : "[ ]";
    const indent = t.parentId ? "  " : "";
    const flags: string[] = [];
    // Revue #201 (fix round 1) : heure locale de l'utilisateur (ctx.timezone),
    // jamais l'ISO UTC brut — un agent qui relaie le texte tel quel le lirait
    // à voix haute à la mauvaise heure.
    if (t.deadlineAt) flags.push(`deadline ${localTimeFromIso(t.deadlineAt, ctx.timezone)}`);
    if (t.isOverdue) flags.push("EN RETARD");
    const suffix = flags.length > 0 ? ` · ${flags.join(" · ")}` : "";
    return `${indent}${box} ${t.id} — ${t.title}${suffix}`;
  });

  const active = tasks.filter((t) => !t.isCompleted).length;
  const header = `Tâches du ${dayDate} — ${active} active(s) sur ${tasks.length} :`;
  return { content: [{ type: "text", text: [header, ...lines].join("\n") }], isError: false };
}

async function handleGetBossStatus(ctx: McpContext): Promise<McpToolResult> {
  const today = await userToday(ctx.supabase, ctx.userId);
  const status = await readBossStatus(ctx.supabase, ctx.userId, today);

  if (!status) {
    return {
      content: [{
        type: "text",
        text: `Le Boss du ${today} n'a pas encore été tiré — il le sera à la prochaine ouverture de l'Arène.`,
      }],
      isError: false,
    };
  }

  return {
    content: [{
      type: "text",
      text: `Boss du ${today} : ${status.name} — ${status.currentHp}/${status.maxHp} HP, ${status.tasksRemaining} tâche(s) restante(s).`,
    }],
    isError: false,
  };
}

async function handleGetStreak(ctx: McpContext): Promise<McpToolResult> {
  const today = await userToday(ctx.supabase, ctx.userId);
  const streak = await readStreak(ctx.supabase, ctx.userId, today);
  const risk = streak.atRisk ? " ⚠ Série en danger." : "";
  return {
    content: [{
      type: "text",
      text: `Série : ${streak.length} jour(s). Jokers utilisés cette semaine : ${streak.jokersUsedThisWeek} sur 2.${risk}`,
    }],
    isError: false,
  };
}

async function handleGetProgression(ctx: McpContext): Promise<McpToolResult> {
  const prog = await readProgression(ctx.supabase, ctx.userId);
  if (!prog) return buildToolErrorResult(domainErrorMessage("profile_not_found"));

  // Revue #201 (fix round 1) : nom d'affichage (comme list_heroes), jamais le
  // slug brut seul — mais le slug reste imprimé entre parenthèses, un agent
  // en aura besoin pour un futur tool `equip_hero`.
  const heroName = prog.equippedHeroId ? getHero(prog.equippedHeroId)?.name ?? prog.equippedHeroId : null;
  const hero = prog.equippedHeroId ? ` Combattant équipé : ${heroName} (${prog.equippedHeroId}).` : "";
  return {
    content: [{
      type: "text",
      text: `Niveau ${prog.level} · ${prog.xp} XP · ${prog.xpToNextLevel} XP avant le niveau ${prog.level + 1} · ${prog.gold} or.${hero}`,
    }],
    isError: false,
  };
}

async function handleListHeroes(ctx: McpContext): Promise<McpToolResult> {
  const roster = await readHeroRoster(ctx.supabase, ctx.userId);
  const ownedCount = roster.filter((h) => h.owned).length;

  const lines = roster.map((h) => {
    const flags: string[] = [];
    if (h.equipped) flags.push("équipé");
    if (!h.owned) flags.push("verrouillé");
    const suffix = flags.length > 0 ? ` (${flags.join(", ")})` : "";
    return `- ${h.id} — ${h.name}${suffix}`;
  });

  const header = `${ownedCount} combattant(s) débloqué(s) sur ${roster.length} :`;
  return { content: [{ type: "text", text: [header, ...lines].join("\n") }], isError: false };
}

function parseCompleteTaskArgs(args: Record<string, unknown>): ParsedArgs<Record<string, unknown>> {
  const taskId = args.task_id;
  if (typeof taskId !== "string") {
    return { ok: false, error: "invalid_args : task_id est requis (string)." };
  }
  // Fix (lot 4, tache 3 - revue finding 4) : l'ancienne forme
  // (`raw === true || raw === "true"`) est un test d'EGALITE, pas une
  // coercition — tout ce qui n'est ni `true`/`"true"` ni `false`/`"false"`
  // (ex. `1`, `"yes"`, `"TRUE"`) retombait silencieusement sur `false`, la
  // branche DESTRUCTRICE (decocher rembourse xp_awarded et remet le combo a
  // zero cote domaine). Un type incorrect doit etre refuse, jamais
  // reinterprete en decochage.
  const raw = args.completed;
  let completed: boolean;
  if (raw === undefined) completed = true;
  else if (raw === true || raw === "true") completed = true;
  else if (raw === false || raw === "false") completed = false;
  else return { ok: false, error: "invalid_args : completed doit etre un booleen." };
  return { ok: true, args: { taskId, completed } };
}

async function handleCompleteTask(ctx: McpContext, args: Record<string, unknown>): Promise<McpToolResult> {
  const outcome = await completeTaskForUser(
    ctx.supabase,
    ctx.userId,
    args.taskId as string,
    args.completed === true,
  );
  if (outcome.error !== null) {
    return buildToolErrorResult(domainErrorMessage(outcome.error));
  }

  const verb = args.completed === true ? "cochée" : "décochée";
  const parts: string[] = [`Tâche ${verb}.`];
  // Revue #201 (lot 4, tache 3) : tous les champs hors `error` sont optionnels
  // (une completion sans transition reelle - re-cocher une tache deja cochee -
  // n'en renvoie aucun) - ne jamais les lire inconditionnellement.
  if (outcome.level !== undefined && outcome.xp !== undefined) {
    parts.push(`Niveau ${outcome.level} · ${outcome.xp} XP.`);
  }
  if (outcome.leveledUp) {
    parts.push("Niveau supérieur atteint !");
  }
  if (outcome.comboCount !== undefined && outcome.comboCount > 1) {
    parts.push(`Combo ×${outcome.comboCount}.`);
  }
  return { content: [{ type: "text", text: parts.join(" ") }], isError: false };
}

function parseSetDeadlineArgs(args: Record<string, unknown>): ParsedArgs<Record<string, unknown>> {
  const taskId = args.task_id;
  if (typeof taskId !== "string") {
    return { ok: false, error: "invalid_args : task_id est requis (string)." };
  }
  const rawDeadline = args.deadline_at;
  if (rawDeadline !== null && typeof rawDeadline !== "string") {
    return { ok: false, error: "invalid_args : deadline_at est requis (string ISO ou null)." };
  }

  // ⚠️ Piege undefined-propagation (cf. brief tache 3) : dans
  // setTaskDeadlineForUser, `undefined` pour ces deux parametres signifie
  // "ne touche pas la colonne", jamais "false"/"valeur par defaut". Un
  // parseur ecrit par symetrie avec parseCompleteTaskArgs
  // (`args.reminder_enabled === true`) transformerait "argument absent" en
  // "desactive explicitement le rappel" - un agent qui repousse simplement
  // une deadline effacerait alors silencieusement le rappel push existant.
  // On propage donc `undefined` tel quel plutot que de le collapser.
  const reminderEnabled =
    args.reminder_enabled === undefined ? undefined : args.reminder_enabled === true;

  // Fix (lot 4, tache 3 - revue finding 1) : le parametre domaine est
  // `number | null` (lib/domain/tasks.ts:526), et `null` signifie "herite le
  // reglage du profil" - distinct de l'absence d'argument (`undefined`, "ne
  // touche pas la colonne"). `Number(null)` valait 0 ("notifier a la
  // deadline elle-meme", un reglage DIFFERENT ecrit silencieusement), et
  // `Number("soon")` valait NaN (serialise en `null` par supabase-js, donc un
  // reset silencieux vers l'heritage profil). Trois cas distincts, et on
  // refuse le reste plutot que de le reinterpreter - meme discipline que les
  // autres parseurs de ce fichier.
  const rawOffset = args.reminder_offset_minutes;
  let reminderOffsetMinutes: number | null | undefined;
  if (rawOffset === undefined) reminderOffsetMinutes = undefined;
  else if (rawOffset === null) reminderOffsetMinutes = null;
  else if (typeof rawOffset !== "number" || !Number.isFinite(rawOffset)) {
    return { ok: false, error: "invalid_args : reminder_offset_minutes doit etre un nombre ou null." };
  } else reminderOffsetMinutes = rawOffset;

  return {
    ok: true,
    args: { taskId, deadlineAt: rawDeadline, reminderEnabled, reminderOffsetMinutes },
  };
}

async function handleSetDeadline(ctx: McpContext, args: Record<string, unknown>): Promise<McpToolResult> {
  const taskId = args.taskId as string;
  const deadlineAt = args.deadlineAt as string | null;
  const reminderOffsetMinutes = args.reminderOffsetMinutes as number | null | undefined;
  const reminderEnabled = args.reminderEnabled as boolean | undefined;

  // Ordre de setTaskDeadlineForUser : (…, deadlineAt, reminderOffsetMinutes,
  // reminderEnabled) - l'offset avant le booleen, contre-intuitif mais verifie
  // (lib/domain/tasks.ts:521).
  const result = await setTaskDeadlineForUser(
    ctx.supabase,
    ctx.userId,
    taskId,
    deadlineAt,
    reminderOffsetMinutes,
    reminderEnabled,
  );
  if (result.error !== null) {
    return buildToolErrorResult(domainErrorMessage(result.error));
  }

  if (deadlineAt === null) {
    return { content: [{ type: "text", text: "Deadline effacée." }], isError: false };
  }
  const localTime = localTimeFromIso(deadlineAt, ctx.timezone);
  return { content: [{ type: "text", text: `Deadline fixée à ${localTime}.` }], isError: false };
}

const NO_ARGS: McpToolDef["parseArgs"] = () => ({ ok: true, args: {} });

export const TOOL_REGISTRY: readonly McpToolDef[] = [
  {
    tool: ADD_TASK_TOOL,
    requiredScope: "tasks:write",
    parseArgs: parseAddTaskArgs,
    handler: handleAddTask,
  },
  {
    tool: LIST_TASKS_TOOL,
    requiredScope: "tasks:read",
    parseArgs: parseListTasksArgs,
    handler: handleListTasks,
  },
  {
    tool: GET_BOSS_STATUS_TOOL,
    requiredScope: "tasks:read",
    parseArgs: NO_ARGS,
    handler: handleGetBossStatus,
  },
  {
    tool: GET_STREAK_TOOL,
    requiredScope: "tasks:read",
    parseArgs: NO_ARGS,
    handler: handleGetStreak,
  },
  {
    tool: GET_PROGRESSION_TOOL,
    requiredScope: "profile:read",
    parseArgs: NO_ARGS,
    handler: handleGetProgression,
  },
  {
    tool: LIST_HEROES_TOOL,
    requiredScope: "profile:read",
    parseArgs: NO_ARGS,
    handler: handleListHeroes,
  },
  {
    tool: COMPLETE_TASK_TOOL,
    requiredScope: "tasks:write",
    parseArgs: parseCompleteTaskArgs,
    handler: handleCompleteTask,
  },
  {
    tool: SET_DEADLINE_TOOL,
    requiredScope: "tasks:write",
    parseArgs: parseSetDeadlineArgs,
    handler: handleSetDeadline,
  },
];

export function findTool(name: string): McpToolDef | undefined {
  return TOOL_REGISTRY.find((def) => def.tool.name === name);
}

// tools/list ne doit exposer que ce qu'un agent peut reellement appeler -
// sinon il tente, echoue, et brule des tours (D3.1 du spec).
export function toolsForScope(grantedScope: string): McpTool[] {
  return TOOL_REGISTRY.filter((def) => hasScope(grantedScope, def.requiredScope)).map(
    (def) => def.tool,
  );
}
