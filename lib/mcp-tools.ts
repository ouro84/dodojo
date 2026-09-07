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
import { listTasksForUser, userToday } from "./domain/tasks";
import { readStreak } from "./domain/streak";
import { readBossStatus } from "./domain/boss";
import { readHeroRoster } from "./domain/heroes";
import { readProgression } from "./domain/progression";
import { localTimeFromIso, nextDayKey } from "./game-engine";
import { getHero } from "./heroes";

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

function parseAddTaskArgs(args: Record<string, unknown>): ParsedArgs<Record<string, unknown>> {
  const rawTitle = args.title;
  if (typeof rawTitle !== "string") {
    return { ok: false, error: "title est requis (string)." };
  }
  return { ok: true, args: { title: rawTitle } };
}

async function handleAddTask(ctx: McpContext, args: Record<string, unknown>): Promise<McpToolResult> {
  const validation = validateTaskTitle(args.title as string);
  if ("error" in validation) {
    return buildToolErrorResult(validation.error);
  }

  try {
    const outcome = await insertTaskForUser(ctx.supabase, {
      userId: ctx.userId,
      title: validation.title,
      timezone: ctx.timezone,
    });
    return buildAddTaskToolResult(outcome);
  } catch {
    return buildToolErrorResult("insert_task_failed");
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

function parseListTasksArgs(args: Record<string, unknown>): ParsedArgs<Record<string, unknown>> {
  const day = args.day ?? "today";
  if (day !== "today" && day !== "tomorrow") {
    return { ok: false, error: "day doit valoir 'today' ou 'tomorrow'." };
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
  if (!prog) return buildToolErrorResult("profile_not_found");

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
