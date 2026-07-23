import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_KEY_SUPABASE!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Ne jamais insérer de logique entre createServerClient et getUser() :
  // getUser() est ce qui déclenche le rafraîchissement du token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // US-58 (PWA) : routes techniques toujours accessibles, authentifié ou non —
  // le navigateur les récupère (lien <head> du manifest, enregistrement du
  // service worker, fallback offline) même sur un visiteur anonyme sur
  // /welcome avant inscription. Distinct de isPublicRoute (qui redirige un
  // utilisateur déjà connecté loin de /login ou /welcome) : ces routes ne
  // redirigent jamais, dans aucun sens.
  const isTechnicalRoute =
    path === "/manifest.webmanifest" ||
    path.startsWith("/serwist/") ||
    path === "/offline";

  if (isTechnicalRoute) {
    return supabaseResponse;
  }

  // Routes publiques (accessibles sans session) : connexion ET inscription.
  const isPublicRoute = path.startsWith("/login") || path.startsWith("/welcome");

  // US-29 (A1) : un visiteur non authentifié est envoyé vers /welcome (signup-first) ;
  // /login reste accessible via un lien.
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/welcome";
    return NextResponse.redirect(url);
  }

  if (user && isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
