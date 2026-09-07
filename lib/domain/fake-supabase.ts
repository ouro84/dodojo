// Faux client Supabase — TEST ONLY, jamais importé par du code de production.
// Source unique partagée par lib/domain/*.test.ts, app/actions/tasks.test.ts
// (la copie locale de ce dernier a été fusionnée ici, issue #201 lot 3) et
// app/api/mcp/route.test.ts (fusionnée à son tour, issue #201 lot 3 tache 4 —
// `.rpc()` ci-dessous vient de cette copie, seul consommateur à ce jour).
// `eq`/`in`/`lt`/`is`/`or` filtrent réellement les lignes (this.filters,
// consulté par apply() en lecture comme en update). `or()` parse uniquement
// la forme étroite "colonne.eq.valeur[,...]" (cf. sa définition) et LÈVE sur
// toute autre forme plutôt que de retomber en no-op silencieux — aucun no-op
// filtre ne reste dans ce fichier (issue #201, lot 4).

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
  private countMode = false;

  constructor(private readonly rows: Row[]) {}

  // Issue #201 (lot 4) : `select("id", { count: "exact", head: true })` doit
  // renvoyer un COMPTE, pas des lignes. Sans ca, les trois comptages de
  // assembleAchievementContext (rage quits, routines, partages reussis)
  // recevaient `count: undefined` quel que soit le contenu de la table — donc
  // aucun test ne pouvait distinguer « n'a compte que mes lignes » de « a tout
  // compte ». Meme angle mort que les filtres no-op soldes au lot 3, et meme
  // enjeu : le serveur MCP appelle le domaine avec un client service-role qui
  // contourne RLS, ces filtres applicatifs sont la seule frontiere de tenant.
  select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    this.countMode = options?.count != null;
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

  // Parse la forme etroite que ce repo emet reellement :
  // `col.eq.valeur,col.eq.valeur` (cf. les six ecritures de
  // lib/domain/tasks.ts, toutes identiques). Les conditions sont OR entre
  // elles, et l'ensemble est AND avec les autres filtres — comme PostgREST.
  //
  // Toute autre forme LEVE, volontairement : un parseur qui retomberait sur
  // un no-op face a une syntaxe inconnue recreerait le faux-vert que ce
  // correctif supprime (issue #201, lot 4), en pire — il aurait l'air de
  // filtrer. Ajouter une forme ici est un geste conscient.
  or(filters: string): this {
    const conditions = filters.split(",").map((raw) => {
      const parts = raw.split(".");
      if (parts.length !== 3 || parts[1] !== "eq") {
        throw new Error(
          `FakeQueryBuilder.or : forme non supportee "${raw}". ` +
            `Seul "colonne.eq.valeur" est parse (cf. commentaire). Etendre le parseur si besoin.`,
        );
      }
      const [column, , value] = parts;
      return (row: Row) => String(row[column]) === value;
    });
    this.filters.push((row) => conditions.some((c) => c(row)));
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
    // En mode `count`, PostgREST renvoie le compte des lignes qui matchent les
    // filtres (et `data: null` quand `head: true`). Le compte porte donc la
    // meme frontiere de tenant que les lignes elles-memes.
    const payload = this.countMode
      ? { data: [] as Row[], count: data.length, error: null as null }
      : { data, error: null as null };
    return Promise.resolve(payload).then(
      onfulfilled ?? undefined,
    ) as PromiseLike<TResult1 | TResult2>;
  }
}

export class FakeSupabaseClient {
  public calls = 0;
  // consumeMcpQuota (lib/mcp-rate-limit.ts) appelle supabase.rpc(...) — par
  // defaut ca autorise (data: true), sauf override explicite via
  // `rpcResult` (utilise par app/api/mcp/route.test.ts pour tester le rate
  // limit). Aucun consommateur de ce fake n'appelle un autre RPC a ce jour.
  public rpcResult = true;

  constructor(private readonly tables: Record<string, Row[]>) {}

  from(table: string): FakeQueryBuilder {
    this.calls += 1;
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQueryBuilder(this.tables[table]);
  }

  async rpc(): Promise<{ data: boolean; error: null }> {
    return { data: this.rpcResult, error: null };
  }

  auth = {
    getUser: vi.fn(async () => ({
      data: { user: { id: "u1" } },
    })),
  };
}
