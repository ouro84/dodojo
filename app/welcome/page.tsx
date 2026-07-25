import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WelcomeSignup from "./WelcomeSignup";

export const metadata: Metadata = { title: "Bienvenue — Dodojo" };

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <h1 className="font-display text-xl uppercase tracking-wide text-ink">Dodojo</h1>
      <p className="max-w-[30ch] text-sm text-muted">
        Ce qui traîne dans ta tête a un nom. Et des HP. Choisis ton nom, ton
        combattant, et entre dans l&apos;Arène.
      </p>
      <WelcomeSignup />
    </main>
  );
}
