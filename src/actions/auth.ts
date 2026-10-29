"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { audit } from "@/lib/audit";
import { devLoginAllowed, isAllowedEmail, productionAccess } from "@/lib/auth/access";
import { env } from "@/lib/env";
import { createSession, currentSessionHash, destroySession, getCurrentUser, requireUser } from "@/lib/auth/session";
import { acceptInvitation, authenticate, changePassword } from "@/lib/auth/users";
import { first, getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!productionAccess().enabled) return { error: "Sign-in is disabled until verified email delivery is configured." };
  const parsed = z.object({ email: z.string().min(3).max(200), password: z.string().min(1).max(200) }).safeParse({
    email: fd.get("email"),
    password: fd.get("password"),
  });
  if (!parsed.success) return { error: "Enter your work email and password." };
  if (!isAllowedEmail(parsed.data.email)) return { error: `Sign in with your @${env().ALLOWED_EMAIL_DOMAIN} work email.` };
  try {
    const user = await authenticate(parsed.data.email, parsed.data.password);
    await createSession(user.id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect("/");
}

export async function devLoginAction(fd: FormData) {
  // Enforced server-side: unavailable in production builds regardless of env flags.
  if (!devLoginAllowed()) throw new Error("Development sign-in is disabled.");
  const userId = Number(fd.get("userId"));
  const user = await first(getDb().select().from(users).where(eq(users.id, userId)));
  if (!user || user.status !== "active") throw new Error("Unknown user");
  await createSession(user.id);
  await audit("auth.dev_login", "user", user.id, user.id);
  redirect("/");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit("auth.logout", "user", user.id, user.id);
  redirect("/login");
}

export async function acceptInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!productionAccess().enabled) return { error: "Account setup is disabled until verified email delivery is configured." };
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { error: "Passwords do not match." };
  try {
    const userId = await acceptInvitation({ token: String(fd.get("token") ?? ""), name: String(fd.get("name") ?? ""), password });
    await createSession(userId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect("/");
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  // Outside the try: an expired session redirects to sign-in rather than showing an error.
  const user = await requireUser("manage_own_account");
  const newPassword = String(fd.get("newPassword") ?? "");
  if (newPassword !== String(fd.get("confirmPassword") ?? "")) return { error: "The new passwords do not match." };
  try {
    const r = await changePassword({
      userId: user.id,
      currentPassword: String(fd.get("currentPassword") ?? ""),
      newPassword,
      keepSessionHash: await currentSessionHash(),
    });
    const others = r.otherSessionsEnded
      ? ` You were signed out on ${r.otherSessionsEnded} other ${r.otherSessionsEnded === 1 ? "device" : "devices"}.`
      : "";
    return { ok: true, message: `Password changed.${others}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
