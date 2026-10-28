import { logoutAction } from "@/actions/auth";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";
import { shellCounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={user} counts={shellCounts()} logoutAction={logoutAction}>
      {children}
    </AppShell>
  );
}
