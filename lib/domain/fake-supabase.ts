// Faux client Supabase — TEST ONLY, jamais importé par du code de production.
// Source unique partagée par lib/domain/*.test.ts et app/actions/tasks.test.ts
// (la copie locale de ce dernier a été fusionnée ici, issue #201 lot 3).
// `eq`/`in`/`lt`/`is` filtrent réellement les lignes (this.filters, consulté
// par apply() en lecture comme en update) — seul `or()` reste un no-op,
// choix documenté juste au-dessus de sa définition, pas un oubli.

import { vi } from "vitest";

type Row = Record<string, unknown>;

// En base, une colonne absente d'une ligne EST un NULL SQL — `.eq`/`.is`
// comparés à `null` doivent donc matcher une colonne absente du fixture
// (`undefined`) tout autant qu'une colonne explicitement posée à `null`.
// Sans ça, `undefined === null` (faux en JS) ferait échouer un match que
// Postgres accepterait, et un test qui asserte une ABSENCE (`toBeNull()`,
// `toHaveLength(0)`, `toBeUndefined()`) passerait pour une raison de forme de
// fixture plutôt que de comportement réel du domaine.
function nullish(value: unknown): boolean {
  return value === null || value === undefined;
}

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

  eq(column: string, value: unknown): this {
    this.filters.push((row) => (value === null ? nullish(row[column]) : row[column] === value));
    return this;
  }

  // `or` reste volontairement permissif : les vraies clauses `.or()` de ce
  // repo sont des chaines PostgREST (`id.eq.X,parent_id.eq.X`) dont le
  // parsing complet n'apporterait rien ici — mais contrairement aux autres,
  // ce no-op est desormais EXPLICITE et documente, plus un oubli silencieux.
  or(): this {
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push((row) => (row[column] as string | number) < (value as string | number));
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push((row) => (value === null ? nullish(row[column]) : row[column] === value));
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  limit(): this {
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => f(row));
  }

  private apply(): Row[] {
    if (this.mode === "insert" && this.insertedRow) {
      this.rows.push(this.insertedRow);
      return [this.insertedRow];
    }
    if (this.mode === "update") {
      const matched = this.rows.filter((row) => this.matches(row));
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
    return this.rows.filter((row) => this.matches(row)).map((row) => ({ ...row }));
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
