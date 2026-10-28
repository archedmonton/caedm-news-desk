import { logoutAction } from "@/actions/auth";
import { AppShell } from "@/components/app-shell";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { developerContact } from "@/lib/developer";
import { shellCounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const counts = shellCounts();
  return (
    <AppShell
      user={user}
      roleLabel={ROLE_LABELS[user.role]}
      developer={developerContact()}
      counts={{ ...counts, accessRequests: can(user.role, "manage_staff") ? counts.accessRequests : 0 }}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
