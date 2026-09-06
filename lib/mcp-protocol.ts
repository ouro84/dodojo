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
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export const ADD_TASK_TOOL: McpTool = {
  name: "add_task",
  description: "Ajoute une tache au combat du jour dans Dodojo.",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string", description: "Titre de la tache a ajouter" } },
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

export function buildAddTaskToolResult(outcome: InsertTaskOutcome): McpToolResult {
  const text =
    "Tache ajoutee pour le " +
    outcome.dayDate +
    ". Boss a " +
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
