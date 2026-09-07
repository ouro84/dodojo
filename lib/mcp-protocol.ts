import type { InsertTaskOutcome } from "./task-insertion";

// US-22 : cadre JSON-RPC 2.0 minimal pour le serveur MCP (transport
// Streamable HTTP, cf. spec d'autorisation MCP). Fonctions PURES - aucune
// I/O ici, le cablage Supabase/insertTaskForUser reste dans
// app/api/mcp/route.ts. MCP_PROTOCOL_VERSION suit la revision de spec la
// plus recente connue a la redaction de ce plan - A REVERIFIER a
// l'implementation (l'ecosysteme "Connected Apps" MCP de Gemini evolue
// vite, cf. design paragraphe Risques & inconnues).
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    // `string | string[]` (issue #201, lot 4 tache 3 - revue finding 2) :
    // JSON Schema autorise un tableau de types pour "l'un ou l'autre" (ex.
    // set_deadline.deadline_at : "string" OU "null" pour effacer). Un simple
    // `type: string` empechait toute propriete d'annoncer ce cas — un client
    // MCP qui valide les arguments contre ce schema avant l'appel rejetterait
    // alors une valeur que le parseur accepte reellement.
    properties: Record<string, { type: string | string[]; description: string }>;
    required: string[];
  };
}

export const ADD_TASK_TOOL: McpTool = {
  name: "add_task",
  description: "Ajoute une tache au combat du jour dans Dodojo.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Titre de la tache a ajouter" },
      // Issue #201 (lot 4, tache 4) : parent_id cree une sous-tache. day ne
      // s'applique jamais en meme temps que parent_id — une sous-tache herite
      // du day_date de sa tache parente (issue #116) ; le parseur (lib/mcp-tools.ts)
      // refuse explicitement la combinaison plutot que de l'ignorer.
      parent_id: {
        type: "string",
        description:
          "Pour creer une sous-tache : identifiant de la tache parente. Mutuellement exclusif avec day (une sous-tache herite du jour de sa tache parente).",
      },
      day: {
        type: "string",
        description:
          "'today' (defaut) ou 'tomorrow'. Mutuellement exclusif avec parent_id (ne s'applique jamais a une sous-tache).",
      },
    },
    required: ["title"],
  },
};

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

export const JSON_RPC_ERROR_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_ERROR_INVALID_PARAMS = -32602;
export const JSON_RPC_ERROR_INTERNAL = -32603;

// Valide la forme minimale d'une requete JSON-RPC 2.0. id absent (une
// notification, ex. notifications/initialized) devient null - jamais
// undefined dans le type retourne, pour rester serialisable tel quel.
export function parseJsonRpcRequest(body: unknown): JsonRpcRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const candidate = body as Record<string, unknown>;
  if (candidate.jsonrpc !== "2.0" || typeof candidate.method !== "string") return null;

  const id = candidate.id;
  if (id !== undefined && id !== null && typeof id !== "string" && typeof id !== "number") {
    return null;
  }

  return {
    jsonrpc: "2.0",
    id: (id as string | number | null | undefined) ?? null,
    method: candidate.method,
    params: (candidate.params as Record<string, unknown> | undefined) ?? undefined,
  };
}

export function buildInitializeResult(): Record<string, unknown> {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: { name: "dodojo-mcp", version: "1.0.0" },
  };
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
}

// BLOCKING 2 (issue #201, lot 5) : `isTomorrow` qualifie explicitement le
// Boss quand la tache vient d'etre creee pour demain — insertTaskForUser
// (lib/task-insertion.ts) calcule alors bossMaxHp/bossCurrentHp a partir des
// taches de DEMAIN, jamais du Boss du jour courant (invariant CLAUDE.md :
// une tache de demain ne peut jamais affecter le Boss d'aujourd'hui). Un
// texte "Boss a X/Y HP" non qualifie serait relaye tel quel par un agent au
// joueur, qui le lirait a tort comme l'etat du Boss du jour.
// Revue #201 (lot 6, finding 3) : `outcome.taskId` (InsertTaskOutcome,
// lib/task-insertion.ts) n'apparaissait nulle part dans le texte renvoye -
// alors que complete_task/set_deadline/move_task/add_task(parent_id) exigent
// tous un task_id, obtenable uniquement en rappelant list_tasks et en
// regex-scrapant son texte (cf. extractTaskId de e2e/mcp-oauth.spec.ts). La
// branche sous-tache du meme tool (lib/mcp-tools.ts, handleAddTask) le
// renvoyait deja - meme forme ici, pour qu'un agent puisse enchainer un
// aller-retour d'ecriture sans round-trip de lecture supplementaire.
export function buildAddTaskToolResult(outcome: InsertTaskOutcome, isTomorrow = false): McpToolResult {
  const bossLabel = isTomorrow ? "Boss de demain a " : "Boss a ";
  const text =
    "Tache ajoutee (id " +
    outcome.taskId +
    ") pour le " +
    outcome.dayDate +
    ". " +
    bossLabel +
    String(outcome.bossCurrentHp) +
    "/" +
    String(outcome.bossMaxHp) +
    " HP.";
  return { content: [{ type: "text", text }], isError: false };
}

export function buildToolErrorResult(message: string): McpToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function successResponse(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function errorResponse(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
