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
          // Audit #67, PR5 : SameSite explicite (défense en profondeur) plutôt
          // que de dépendre du défaut de @supabase/ssr.
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, { ...options, sameSite: "lax" }),
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

  // US-29 (A1) : un visiteur non authentifié est envoyé vers /welcome (signup-first) ;
  // /login reste accessible via un lien.
  if (!user && !isPublicRoute(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/welcome";
    return NextResponse.redirect(url);
  }

  // Distinct de isPublicRoute : /login et /welcome uniquement. isPublicRoute
  // inclut aussi /api/* (US-11) pour laisser passer les appelants externes
  // sans cookie (cron, futurs webhooks/OAuth) — mais un utilisateur DÉJÀ
  // authentifié qui appelle une route /api/* protégée par sa propre logique
  // (ex. /api/share-card, US-20) ne doit jamais être bounced vers "/" : seule
  // une visite de /login ou /welcome déjà connecté doit rediriger.
  if (user && (path.startsWith("/login") || path.startsWith("/welcome"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

// Routes publiques (accessibles sans session) : connexion, inscription, et
// toute route technique sous /api/ (cron, webhooks, futurs endpoints
// OAuth/MCP) — ces routes s'authentifient par leur propre mécanisme (secret,
// token, session OAuth), jamais par cookie Supabase. Les rediriger vers
// /welcome casserait silencieusement leurs appelants externes (GitHub
// Actions, iOS Shortcuts, Gemini). Voir le garde ci-dessus pour la nuance
// avec les utilisateurs déjà authentifiés.
// US-22 : /oauth/* et /.well-known/* s'ajoutent à /api/* (US-11) — routes
// techniques appelées sans cookie Supabase (Gemini), gèrent leur propre
// authentification (PKCE, Bearer, service-role).
// Issue #134 : pages légales publiques — un visiteur non authentifié (avant
// inscription) doit pouvoir les lire, même raisonnement que /login/welcome.
export function isPublicRoute(path: string): boolean {
  return (
    path.startsWith("/login") ||
    path.startsWith("/welcome") ||
    path.startsWith("/api/") ||
    path.startsWith("/oauth/") ||
    path.startsWith("/.well-known/") ||
    path.startsWith("/mentions-legales") ||
    path.startsWith("/confidentialite") ||
    path.startsWith("/cgu") ||
    path.startsWith("/informations-legales")
  );
}
