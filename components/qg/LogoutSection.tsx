"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Issue #69 : aucun bouton de déconnexion n'existait nulle part dans l'app
// avant cette page (zéro signOut() dans le code, vérifié).
export default function LogoutSection() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Compte</p>
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        className="self-start rounded border border-alert px-3 py-1.5 text-xs uppercase tracking-wide text-alert disabled:opacity-50"
      >
        {pending ? "…" : "Se déconnecter"}
      </button>
    </section>
  );
}
