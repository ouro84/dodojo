import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findGeminiClientIds, isGeminiConnected } from "./oauth-gemini";

type Row = Record<string, unknown>;

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
  return new RegExp("^" + escaped + "$", "i");
}

class FakeQueryBuilder implements PromiseLike<{ data: Row[] | null; error: null; count: number | null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private wantCount = false;

  constructor(private readonly rows: Row[]) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    this.wantCount = Boolean(options?.count);
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  ilike(column: string, pattern: string): this {
    const regexp = globToRegExp(pattern);
    this.filters.push((row) => regexp.test(String(row[column] ?? "")));
    return this;
  }

  private matched(): Row[] {
    return this.rows.filter((row) => this.filters.every((f) => f(row)));
  }

  then<TResult1 = { data: Row[] | null; error: null; count: number | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: Row[] | null; error: null; count: number | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    const matched = this.matched();
    const result = this.wantCount
      ? { data: null, error: null as null, count: matched.length }
      : { data: matched, error: null as null, count: null };
    return Promise.resolve(result).then(onfulfilled ?? undefined) as PromiseLike<TResult1 | TResult2>;
  }
}

class FakeSupabaseClient {
  constructor(private readonly tables: Record<string, Row[]>) {}
  from(table: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this.tables[table] ?? []);
  }
}

// Audit #67, PR5 : cast unique et localisé au retour (pas de paramètre/
// variable typé `any`) — la règle projet "Interdiction d'utiliser `any`"
// ne prévoit pas d'exception test.
function fakeSupabase(tables: Record<string, Row[]>): SupabaseClient {
  return new FakeSupabaseClient(tables) as unknown as SupabaseClient;
}

describe("findGeminiClientIds (US-22)", () => {
  test("trouve les client_id dont le nom contient gemini (insensible a la casse)", async () => {
    const supabase = fakeSupabase({
      oauth_clients: [
        { client_id: "c1", client_name: "Google Gemini" },
        { client_id: "c2", client_name: "Siri Shortcuts" },
      ],
    });
    expect(await findGeminiClientIds(supabase)).toEqual(["c1"]);
  });

  test("aucun client Gemini enregistre -> tableau vide", async () => {
    const supabase = fakeSupabase({ oauth_clients: [] });
    expect(await findGeminiClientIds(supabase)).toEqual([]);
  });
});

describe("isGeminiConnected", () => {
  test("true si un oauth_tokens existe pour l'utilisateur sur un client Gemini", async () => {
    const supabase = fakeSupabase({
      oauth_clients: [{ client_id: "c1", client_name: "Gemini" }],
      oauth_tokens: [{ id: "t1", user_id: "u1", client_id: "c1" }],
    });
    expect(await isGeminiConnected(supabase, "u1")).toBe(true);
  });

  test("false si aucun token pour cet utilisateur", async () => {
    const supabase = fakeSupabase({
      oauth_clients: [{ client_id: "c1", client_name: "Gemini" }],
      oauth_tokens: [{ id: "t1", user_id: "autre-user", client_id: "c1" }],
    });
    expect(await isGeminiConnected(supabase, "u1")).toBe(false);
  });

  test("false si aucun client Gemini n'est enregistre du tout", async () => {
    const supabase = fakeSupabase({ oauth_clients: [], oauth_tokens: [] });
    expect(await isGeminiConnected(supabase, "u1")).toBe(false);
  });
});
