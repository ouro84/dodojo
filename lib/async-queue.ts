// File d'attente par clé : sérialise les appels asynchrones qui touchent la
// même ressource (ici, un groupe de fratrie de tâches), pour éviter qu'une
// réponse réseau plus lente écrase le résultat d'un appel plus récent.
export function createKeyedQueue<K>() {
  const tails = new Map<K, Promise<void>>();

  function run<T>(key: K, fn: () => Promise<T>): Promise<T> {
    const previousTail = tails.get(key) ?? Promise.resolve();
    const result = previousTail.then(fn, fn);
    // La queue interne ne doit jamais rejeter (sinon la chaîne s'arrête pour
    // les appels suivants) — on l'avale ici, mais `result` (retourné à
    // l'appelant) garde le vrai statut de `fn`.
    tails.set(
      key,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  return { run };
}
