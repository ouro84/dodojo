import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: process.env.INNGEST_APP_ID ?? "dodojo",
  eventKey: process.env.INNGEST_EVENT_KEY ?? "",
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
