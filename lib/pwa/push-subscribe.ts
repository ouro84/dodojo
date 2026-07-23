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
