import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_KEY_SUPABASE!,
    // Audit #67, PR5 : SameSite explicite (défense en profondeur) plutôt que
    // de dépendre du défaut de @supabase/ssr.
    { cookieOptions: { sameSite: "lax" } },
  );
}
