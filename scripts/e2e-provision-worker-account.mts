// Provisionne un compte e2e supplémentaire (isolation multi-comptes, PR2 —
// un compte par worker Playwright, cf. `e2e/fixtures.ts`). Reproduit
// exactement ce que fait le flow d'onboarding applicatif
// (`app/onboarding/actions.ts`) via service-role : aucun trigger n'auto-crée
// `profiles` à l'inscription (US-14), un simple `admin.createUser()` ne
// suffit donc pas à obtenir un compte utilisable par l'app.
//
// Idempotent : relançable sans risque si le compte existe déjà (auth user,
// profil et possession fire_knight sont chacun vérifiés avant création).
//
// Usage : node --experimental-strip-types scripts/e2e-provision-worker-account.mts <email> <password> <pseudo>
import { createClient } from "@supabase/supabase-js";
import { listUsersRetrying } from "../e2e/fixtures.ts";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Pas de .env.local : les variables doivent déjà être dans l'environnement.
}

const [, , email, password, pseudo] = process.argv;
if (!email || !password || !pseudo) {
  throw new Error(
    "Usage : node --experimental-strip-types scripts/e2e-provision-worker-account.mts <email> <password> <pseudo>",
  );
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
if (!url || !key) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE manquants (.env.local).");
}
const admin = createClient(url, key, { auth: { persistSession: false } });

const users = await listUsersRetrying(admin);
let uid = users.find((u) => u.email === email)?.id;

if (!uid) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createUser a échoué pour ${email} : ${error?.message ?? "inconnu"}`);
  }
  uid = data.user.id;
  console.log(`Auth user créé (${email}).`);
} else {
  console.log(`Auth user déjà existant (${email}), réutilisé.`);
}

const { data: existingProfile } = await admin.from("profiles").select("id").eq("id", uid).maybeSingle();
if (!existingProfile) {
  const { error } = await admin.from("profiles").insert({
    id: uid,
    username: pseudo,
    timezone: "Europe/Paris",
    equipped_hero_id: "fire_knight",
    aggressivity_level: "direct",
  });
  if (error) throw new Error(`Insert profiles a échoué pour ${email} : ${error.message}`);
  console.log(`Profil créé (${pseudo}).`);
} else {
  console.log(`Profil déjà existant pour ${email}, conservé.`);
}

const { error: heroError } = await admin
  .from("unlocked_heroes")
  .upsert({ user_id: uid, hero_id: "fire_knight", price_paid: 0 }, { onConflict: "user_id,hero_id" });
if (heroError) throw new Error(`Upsert unlocked_heroes a échoué pour ${email} : ${heroError.message}`);

console.log(`Compte e2e worker prêt : ${email} (uid ${uid}).`);
