import { logoutAction } from "@/actions/auth";
import { AppShell } from "@/components/app-shell";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { developerContact } from "@/lib/developer";
import { latestStoryId, shellCounts } from "@/lib/queries";
import { getTickState } from "@/lib/tick";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [counts, latest, tick] = await Promise.all([shellCounts(), latestStoryId(), getTickState()]);
  return (
    <AppShell
      user={user}
      roleLabel={ROLE_LABELS[user.role]}
      developer={developerContact()}
      latestStoryId={latest}
      lastRefreshAt={tick?.lastTickAt ?? null}
      counts={{ ...counts, accessRequests: can(user.role, "manage_staff") ? counts.accessRequests : 0 }}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
