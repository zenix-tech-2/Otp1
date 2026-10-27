import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AppError } from "./server";
import { maskedName } from "./gift-core";
/** Finds who a gift goes to. Throws a friendly error if the email can't receive one. */
export async function resolveGiftRecipient(sender: { id: string; email: string; isDemo: boolean }, email: string) {
  if (email === sender.email.toLowerCase()) throw new AppError("That’s your own email. Buy it normally to keep it for yourself.");
  const [target] = await db.select({ id: users.id, name: users.name, suspended: users.suspended, isDemo: users.isDemo }).from(users).where(eq(users.email, email));
  if (!target || target.suspended || target.isDemo !== sender.isDemo) throw new AppError("We couldn’t find a Digisms Pro account with that email. Ask them to sign up first.", 404);
  return { id: target.id, name: target.name, masked: maskedName(target.name) };
}
