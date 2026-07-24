"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Identifiants refusés. Vérifie ton email et ton mot de passe.");
      setPending(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      <h1 className="font-display text-xl uppercase tracking-wide text-ink">
        Dodojo
      </h1>
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-xs flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className="text-xs uppercase tracking-wide text-faint"
          >
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
          <label
            htmlFor="password"
            className="text-xs uppercase tracking-wide text-faint"
          >
            Mot de passe
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
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
          {pending ? "Connexion…" : "Entrer dans le dojo"}
        </button>
      </form>
      <Link href="/welcome" className="text-xs text-faint underline underline-offset-4">
        Pas encore de compte ? Crée ton combattant
      </Link>
    </main>
  );
}
