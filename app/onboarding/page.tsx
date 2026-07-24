import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingFlow from "./OnboardingFlow";

export const metadata: Metadata = { title: "Créer ton combattant — Dodojo" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    redirect("/");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-xl uppercase tracking-wide text-ink">
          En garde.
        </h1>
        <p className="max-w-[26ch] text-sm text-muted">
          Un Boss t&apos;attend déjà. Il connaît ton adresse. Donne-lui ton
          nom.
        </p>
      </div>
      <OnboardingFlow />
    </main>
  );
}
