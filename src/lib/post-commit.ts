import "server-only";
import { after } from "next/server";
import { withTiming } from "./performance";
// Next/Vercel keeps this callback alive after returning the committed result.
// Email helpers log delivery results; Sheets has its existing durable retry queue.
export function postCommit(label: string, work: () => Promise<unknown>) {
  after(async () => {
    try {
      await withTiming(label, work);
    } catch {
      console.error(
        `[integration] ${label} failed after commit; inspect delivery history/retry queue.`,
      );
    }
  });
}
