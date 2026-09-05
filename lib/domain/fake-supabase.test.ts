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
    const { data: before } = await client.from("tasks").select().eq().maybeSingle();
    await client.from("tasks").update({ is_completed: true }).eq();
    expect(before?.is_completed).toBe(false);
  });
});
