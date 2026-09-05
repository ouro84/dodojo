// Faux client Supabase — TEST ONLY, jamais importé par du code de production.
// Copie délibérée de app/actions/tasks.test.ts (lot 1, issue #201) : ce
// fichier de test est sous contrainte « aucune modification » pendant la
// refacto, on ne peut donc pas l'y remplacer par un import. Les deux copies
// seront fusionnées dans un PR ultérieur.

import { describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

export class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private mode: "select" | "insert" | "update" = "select";
  private patch: Row = {};
  private insertedRow: Row | null = null;

  constructor(private readonly rows: Row[]) {}

  select(): this {
    return this;
  }

  insert(row: Row): this {
    this.mode = "insert";
    this.insertedRow = { id: `task-${this.rows.length + 1}`, ...row };
    return this;
  }

  update(patch: Row): this {
    this.mode = "update";
    this.patch = patch;
    return this;
  }

  eq(): this {
    this.filters.push(() => true);
    return this;
  }

  or(): this {
    this.filters.push(() => true);
    return this;
  }

  lt(): this {
    this.filters.push(() => true);
    return this;
  }

  is(): this {
    this.filters.push(() => true);
    return this;
  }

  in(): this {
    this.filters.push(() => true);
    return this;
  }

  limit(): this {
    return this;
  }

  private apply(): Row[] {
    if (this.mode === "insert" && this.insertedRow) {
      this.rows.push(this.insertedRow);
      return [this.insertedRow];
    }
    if (this.mode === "update") {
      const matched = this.rows.filter(() => true);
      for (const row of matched) Object.assign(row, this.patch);
      return matched;
    }
    // Clone en lecture : un `select` renvoie un instantané détaché, comme le
    // vrai Supabase (les lignes désérialisées ne sont pas des références
    // vivantes vers l'état serveur) — sans ça, un `update` déclenché APRÈS un
    // `select` mutait rétroactivement les objets déjà lus par un appelant qui
    // avait fetché sa propre copie avant de faire son propre update ailleurs
    // (rageQuitTask lit deadline_at/deferred_at avant d'effacer ce dernier).
    // Découvert en l'ajoutant : sans lui, `existingTask` (setTaskCompleted)
    // était mutée en place par l'update qui le précède, donc `isRealTransition`
    // valait toujours `false` — la branche XP/achievements n'était jamais
    // réellement exercée par ces tests malgré l'apparence de passer.
    return this.rows.map((row) => ({ ...row }));
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const rows = this.apply();
    return { data: rows[0] ?? null, error: null };
  }

  async single(): Promise<{ data: Row | null; error: null }> {
    const rows = this.apply();
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const data = this.apply();
    return Promise.resolve({ data, error: null as null }).then(
      onfulfilled ?? undefined,
    ) as PromiseLike<TResult1 | TResult2>;
  }
}

export class FakeSupabaseClient {
  public calls = 0;
  constructor(private readonly tables: Record<string, Row[]>) {}

  from(table: string): FakeQueryBuilder {
    this.calls += 1;
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQueryBuilder(this.tables[table]);
  }

  auth = {
    getUser: vi.fn(async () => ({
      data: { user: { id: "u1" } },
    })),
  };
}
