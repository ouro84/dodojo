import { describe, it, expect } from "vitest";
import { createKeyedQueue } from "./async-queue";

describe("createKeyedQueue", () => {
  it("exécute les appels d'une même clé dans l'ordre de dispatch, même si leur résolution réseau arrive dans le désordre", async () => {
    const queue = createKeyedQueue<string>();
    const order: string[] = [];

    // Dispatché en premier, mais résout APRÈS le second (délai plus long) —
    // simule le cas où la requête réseau la plus ancienne arrive en dernier.
    const first = queue.run(
      "group-a",
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            order.push("first");
            resolve();
          }, 50);
        }),
    );
    const second = queue.run(
      "group-a",
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            order.push("second");
            resolve();
          }, 10);
        }),
    );

    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  it("exécute les appels de clés différentes indépendamment (pas de blocage inter-clés)", async () => {
    const queue = createKeyedQueue<string>();
    const order: string[] = [];

    const a = queue.run(
      "group-a",
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            order.push("a");
            resolve();
          }, 50);
        }),
    );
    const b = queue.run(
      "group-b",
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            order.push("b");
            resolve();
          }, 10);
        }),
    );

    await Promise.all([a, b]);
    expect(order).toEqual(["b", "a"]);
  });

  it("continue la chaîne même si un appel précédent rejette", async () => {
    const queue = createKeyedQueue<string>();

    const failing = queue.run("group-a", () => Promise.reject(new Error("boom")));
    const after = queue.run("group-a", () => Promise.resolve("ok"));

    await expect(failing).rejects.toThrow("boom");
    await expect(after).resolves.toBe("ok");
  });
});
