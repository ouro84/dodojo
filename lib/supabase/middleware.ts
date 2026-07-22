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

  // Routes publiques (accessibles sans session) : connexion ET inscription.
  const path = request.nextUrl.pathname;
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
