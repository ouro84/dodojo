import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WelcomeSignup from "./WelcomeSignup";

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
        Chaque jour, un Boss se dresse sur ta route. Choisis ton nom, ton
        combattant, et entre dans l&apos;Arène.
      </p>
      <WelcomeSignup />
    </main>
  );
}
