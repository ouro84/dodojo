"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// US-29 : signup client-side (même patron que /login) → session directe (Confirm
// email OFF) → /onboarding. Pas de server action, pour la propagation du cookie.
export default function WelcomeSignup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Mot de passe : 8 caractères minimum.");
      return;
    }
    setPending(true);

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setError(
        /registered|already/i.test(signUpError.message)
          ? "Ce mail a déjà un compte. Connecte-toi."
          : "Impossible de créer le compte. Réessaie.",
      );
      setPending(false);
      return;
    }

    router.replace("/onboarding");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs uppercase tracking-wide text-faint">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink outline-none focus-visible:ring-2 focus-visible:ring-xp"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs uppercase tracking-wide text-faint">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink outline-none focus-visible:ring-2 focus-visible:ring-xp"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-hp px-3 py-1.5 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-50"
      >
        {pending ? "…" : "Entrer dans l'Arène"}
      </button>
      <p className="text-center text-[10px] text-faint">
        En créant ton compte, tu acceptes les{" "}
        <Link href="/cgu" className="underline underline-offset-4">
          CGU
        </Link>{" "}
        et la{" "}
        <Link href="/confidentialite" className="underline underline-offset-4">
          politique de confidentialité
        </Link>
        .
      </p>
      <Link href="/login" className="text-center text-xs text-faint underline underline-offset-4">
        Déjà un compte ? Se connecter
      </Link>
    </form>
  );
}
