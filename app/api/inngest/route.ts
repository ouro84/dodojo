import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { sendReminder } from "@/lib/inngest/functions/send-reminder";

// web-push (utilisé par les fonctions Inngest) ainsi que le SDK Inngest
// serve handler s'appuient sur des API Node (crypto) — pas compatible edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// L1 : `send-reminder` est enregistrée. Le tableau grossira en L2b si d'autres
// fonctions sont introduites.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendReminder],
});
