import { describe, expect, test } from "vitest";
import { FakeSupabaseClient } from "./fake-supabase";

describe("FakeSupabaseClient", () => {
  test("n'incrémente calls que sur from(), jamais sur auth.getUser()", async () => {
    const client = new FakeSupabaseClient({ profiles: [{ id: "u1" }] });
    await client.auth.getUser();
    expect(client.calls).toBe(0);
    client.from("profiles");
    expect(client.calls).toBe(1);
  });

  test("select renvoie un instantané détaché, pas une référence vivante", async () => {
    const client = new FakeSupabaseClient({ tasks: [{ id: "t1", is_completed: false }] });
    const { data: before } = await client.from("tasks").select().eq("id", "t1").maybeSingle();
    await client.from("tasks").update({ is_completed: true }).eq("id", "t1");
    expect(before?.is_completed).toBe(false);
  });
});

describe("FakeQueryBuilder — filtres réels (issue #201, lot 3)", () => {
  test("eq filtre réellement les lignes", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "t1", user_id: "u1", title: "mienne" },
        { id: "t2", user_id: "u2", title: "autre" },
      ],
    });
    const { data } = await c.from("tasks").select().eq("user_id", "u1");
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("t1");
  });

  test("eq enchaînés se cumulent (AND)", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "t1", user_id: "u1", day_date: "2026-09-06" },
        { id: "t2", user_id: "u1", day_date: "2026-09-05" },
        { id: "t3", user_id: "u2", day_date: "2026-09-06" },
      ],
    });
    const { data } = await c.from("tasks").select().eq("user_id", "u1").eq("day_date", "2026-09-06");
    expect(data.map((r) => r.id)).toEqual(["t1"]);
  });

  test("in filtre sur une liste de valeurs", async () => {
    const c = new FakeSupabaseClient({
      tasks: [{ id: "t1" }, { id: "t2" }, { id: "t3" }],
    });
    const { data } = await c.from("tasks").select().in("id", ["t1", "t3"]);
    expect(data.map((r) => r.id)).toEqual(["t1", "t3"]);
  });

  test("lt filtre strictement inférieur", async () => {
    const c = new FakeSupabaseClient({
      tasks: [{ id: "t1", day_date: "2026-09-05" }, { id: "t2", day_date: "2026-09-07" }],
    });
    const { data } = await c.from("tasks").select().lt("day_date", "2026-09-06");
    expect(data.map((r) => r.id)).toEqual(["t1"]);
  });

  test("is filtre sur null", async () => {
    const c = new FakeSupabaseClient({
      tasks: [{ id: "t1", parent_id: null }, { id: "t2", parent_id: "t1" }],
    });
    const { data } = await c.from("tasks").select().is("parent_id", null);
    expect(data.map((r) => r.id)).toEqual(["t1"]);
  });

  test("update ne touche que les lignes filtrées", async () => {
    const rows = [
      { id: "t1", user_id: "u1", done: false },
      { id: "t2", user_id: "u2", done: false },
    ];
    const c = new FakeSupabaseClient({ tasks: rows });
    await c.from("tasks").update({ done: true }).eq("user_id", "u1");
    expect(rows.find((r) => r.id === "t1")?.done).toBe(true);
    expect(rows.find((r) => r.id === "t2")?.done).toBe(false);
  });

  test("maybeSingle respecte les filtres", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 3 }, { id: "u2", level: 9 }],
    });
    const { data } = await c.from("profiles").select().eq("id", "u2").maybeSingle();
    expect(data?.level).toBe(9);
  });
});
