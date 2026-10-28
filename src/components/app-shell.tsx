"use client";

import { ClipboardList, Inbox, LayoutDashboard, LogOut, Menu, Newspaper, Radio, Settings, UserCog, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { HelpProvider, HelpTrigger } from "@/components/help";
import { LiveUpdates } from "@/components/live-updates";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/news", label: "News Feed", icon: Newspaper },
  { href: "/follow-ups", label: "Follow-ups", icon: ClipboardList },
  { href: "/sources", label: "Sources", icon: Radio },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  user,
  roleLabel,
  developer,
  latestStoryId,
  lastRefreshAt,
  counts,
  logoutAction,
  children,
}: {
  user: { name: string; email: string; role: string };
  roleLabel: string;
  developer: { name: string; email: string };
  latestStoryId: number;
  lastRefreshAt: number | null;
  counts: { followUps: number; outboxFailed: number; accessRequests: number };
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-navy-100/80 transition-colors hover:bg-white/5 hover:text-white",
            isActive(pathname, href) && "bg-white/10 font-medium text-white",
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="flex-1">{label}</span>
          {href === "/follow-ups" && counts.followUps > 0 ? (
            <span className="rounded-full bg-white/15 px-1.5 text-[11px] text-white">{counts.followUps}</span>
          ) : null}
          {href === "/" && counts.accessRequests > 0 ? (
            <span className="rounded-full bg-gold-500 px-1.5 text-[11px] text-white" title="Pending access requests">
              {counts.accessRequests}
            </span>
          ) : null}
        </Link>
      ))}
      <div className="mt-4 border-t border-white/10 pt-4">
        <Link
          href="/outbox"
          aria-current={isActive(pathname, "/outbox") ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-navy-100/80 hover:bg-white/5 hover:text-white",
            isActive(pathname, "/outbox") && "bg-white/10 font-medium text-white",
          )}
        >
          <Inbox className="size-4" aria-hidden />
          <span className="flex-1">Email outbox</span>
          {counts.outboxFailed > 0 ? <span className="rounded-full bg-p0 px-1.5 text-[11px] text-white">{counts.outboxFailed}</span> : null}
        </Link>
        <Link
          href="/account"
          aria-current={isActive(pathname, "/account") ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-navy-100/80 hover:bg-white/5 hover:text-white",
            isActive(pathname, "/account") && "bg-white/10 font-medium text-white",
          )}
        >
          <UserCog className="size-4" aria-hidden />
          <span className="flex-1">My account</span>
        </Link>
        <HelpTrigger variant="sidebar" label="Help & support" />
        <HelpTrigger variant="sidebar" view="feature" />
      </div>
    </nav>
  );

  const brand = (
    <Link href="/" className="block">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-gold-500">Archdiocese of Edmonton</div>
      <div className="font-serif text-lg font-semibold leading-tight text-white">CAEDM News Desk</div>
    </Link>
  );

  const userBox = (
    <div className="border-t border-white/10 pt-4">
      <div className="truncate text-sm font-medium text-white">{user.name || user.email}</div>
      <div className="truncate text-xs text-navy-100/70">
        {roleLabel} · {user.email}
      </div>
      <form action={logoutAction} className="mt-2">
        <button className="flex items-center gap-1.5 text-xs text-navy-100/70 hover:text-white" type="submit">
          <LogOut className="size-3.5" aria-hidden /> Sign out
        </button>
      </form>
    </div>
  );

  return (
    <HelpProvider developer={developer} signedIn>
      <div className="min-h-dvh lg:pl-60">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-6 bg-navy-900 px-4 py-6 lg:flex">
          {brand}
          <div className="flex-1">{nav}</div>
          {userBox}
        </aside>
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center justify-between bg-navy-900 px-4 py-3 lg:hidden">
          {brand}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="rounded-md p-2 text-white hover:bg-white/10"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </header>
        {open ? (
          <div id="mobile-nav" className="fixed inset-x-0 top-[60px] z-20 flex flex-col gap-6 bg-navy-900 px-4 pb-6 pt-2 shadow-lg lg:hidden">
            {nav}
            {userBox}
          </div>
        ) : null}
        <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <LiveUpdates initialLatestId={latestStoryId} initialLastRefreshAt={lastRefreshAt} />
          {children}
        </main>
      </div>
    </HelpProvider>
  );
}
