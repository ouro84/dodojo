// Convertit la clé publique VAPID (base64url, NEXT_PUBLIC_VAPID_PUBLIC_KEY)
// en Uint8Array attendu par PushManager.subscribe({ applicationServerKey }).
// Algorithme standard (padding base64 + caractères url-safe → standards).
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface SerializedPushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Issue #215 : souscription garantie neuve. Un navigateur peut garder en local
// un abonnement que le service push rejette déjà (404/410) ; le réutiliser
// réinsérerait en base un endpoint mort. On désabonne donc l'éventuel
// existant avant de souscrire (subscribe() sur une souscription existante
// renverrait la même, voire échouerait si la clé VAPID diffère).
// Renvoie null si la clé VAPID manque ou si la souscription est incomplète.
export async function createFreshPushSubscription(
  registration: ServiceWorkerRegistration,
): Promise<SerializedPushSubscriptionJson | null> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return null;

  const existing = await registration.pushManager.getSubscription();
  await existing?.unsubscribe();

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    // TS 5.9 distingue Uint8Array<ArrayBuffer> de Uint8Array<ArrayBufferLike> ;
    // BufferSource (défini pour SharedArrayBuffer aussi) n'infère pas l'un
    // depuis l'autre — le cast est sûr, le buffer vient bien d'un ArrayBuffer
    // neuf (new Uint8Array(length) dans urlBase64ToUint8Array).
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
  return serializePushSubscription(subscription);
}

export function serializePushSubscription(
  subscription: PushSubscription,
): SerializedPushSubscriptionJson | null {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}
