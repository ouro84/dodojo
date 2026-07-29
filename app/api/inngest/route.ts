import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";

// web-push (utilisé par les fonctions Inngest en L1) ainsi que le SDK Inngest
// serve handler s'appuient sur des API Node (crypto) — pas compatible edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// L0 : aucune fonction enregistrée (le tableau est rempli en L1 avec
// `sendReminder`). Le dev server Inngest doit pouvoir ping l'endpoint pour
// le handshake de sync (le probe passe par GET).
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [],
});
