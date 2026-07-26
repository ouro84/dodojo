import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/game-engine";
import RecurringManager, {
  type ManagedTemplate,
} from "@/components/combat/RecurringManager";
import BottomNav from "@/components/ui/BottomNav";

export const metadata: Metadata = { title: "Mes Routines — Dodojo" };

// US-17 : Mes Routines — gestion des routines (créer, désactiver, jour de repos).
export default async function EntrainementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const today = dayKey(new Date(), profile?.timezone ?? "UTC");

  const [
    { data: templates, error: templatesError },
    { data: restDays, error: restDaysError },
  ] = await Promise.all([
    supabase
      .from("recurring_templates")
      .select("id, title, weekdays, position")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("position", { ascending: true }),
    supabase
      .from("recurring_rest_days")
      .select("template_id")
      .eq("user_id", user.id)
      .eq("day_date", today),
  ]);

  // Audit #67, PR6 (règle projet n°3) : dégradation silencieuse auparavant.
  if (templatesError || restDaysError) {
    throw templatesError ?? restDaysError;
  }

  const restIds = new Set((restDays ?? []).map((r) => r.template_id as string));
  const managed: ManagedTemplate[] = (templates ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    weekdays: t.weekdays ?? [],
    isRestToday: restIds.has(t.id),
  }));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-center font-hud text-lg font-semibold uppercase tracking-wide text-ink">
        Mes Routines
      </h1>
      <p className="text-center text-xs text-muted">
        Tes quêtes quotidiennes réapparaissent d&apos;elles-mêmes au réveil, les
        jours choisis.
      </p>
      <RecurringManager templates={managed} />
      <BottomNav active="qg" />
    </main>
  );
}
