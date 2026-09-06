import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeMcpQuota } from "./mcp-rate-limit";

function fakeRpcClient(returnValue: boolean | { error: string }): {
  client: SupabaseClient;
  calls: Array<{ fn: string; args: unknown }>;
} {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const client = {
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (typeof returnValue === "object") {
        return Promise.resolve({ data: null, error: returnValue.error });
      }
      return Promise.resolve({ data: returnValue, error: null });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("consumeMcpQuota", () => {
  test("appelle consume_mcp_quota avec les bons parametres par defaut", async () => {
    const { client, calls } = fakeRpcClient(true);
    const allowed = await consumeMcpQuota(client, "u1");
    expect(allowed).toBe(true);
    expect(calls).toEqual([
      { fn: "consume_mcp_quota", args: { p_user_id: "u1", p_limit: 120, p_window_seconds: 60 } },
    ]);
  });

  test("renvoie false quand le quota est depasse", async () => {
    const { client } = fakeRpcClient(false);
    const allowed = await consumeMcpQuota(client, "u1");
    expect(allowed).toBe(false);
  });

  test("une erreur RPC est fail-open (ne bloque jamais un appel legitime sur une panne de la fonction elle-meme)", async () => {
    const { client } = fakeRpcClient({ error: "connection lost" });
    const allowed = await consumeMcpQuota(client, "u1");
    expect(allowed).toBe(true);
  });

  test("accepte des limites personnalisees", async () => {
    const { client, calls } = fakeRpcClient(true);
    await consumeMcpQuota(client, "u1", 5, 30);
    expect(calls[0].args).toEqual({ p_user_id: "u1", p_limit: 5, p_window_seconds: 30 });
  });
});
