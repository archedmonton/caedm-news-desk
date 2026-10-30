"use client";

import { Bell, BookOpen, ClipboardList, Inbox, LayoutDashboard, LogOut, Menu, Newspaper, Radio, Settings, UserCog, Users, X } from "lucide-react";
import Image from "next/image";
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
  { href: "/notifications", label: "Notifications & alerts", icon: Bell },
  { href: "/team", label: "Team management", icon: Users, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

const linkClass = (active: boolean) =>
  cn(
    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-maroon-50 hover:text-maroon-800",
    active && "bg-maroon-50 font-medium text-maroon-800 shadow-[inset_3px_0_0_var(--color-gold-500)]",
  );

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  user,
  roleLabel,
  canManageStaff,
  developer,
  latestStoryId,
  lastRefreshAt,
  counts,
  logoutAction,
  children,
}: {
  user: { name: string; email: string; role: string };
  roleLabel: string;
  canManageStaff: boolean;
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
      {NAV.filter((n) => !n.adminOnly || canManageStaff).map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={linkClass(isActive(pathname, href))}
        >
          <Icon className="size-4" aria-hidden />
          <span className="flex-1">{label}</span>
          {href === "/follow-ups" && counts.followUps > 0 ? (
            <span className="rounded-full bg-maroon-100 px-1.5 text-[11px] text-maroon-800">{counts.followUps}</span>
          ) : null}
          {(href === "/" || href === "/team") && counts.accessRequests > 0 ? (
            <span className="rounded-full bg-gold-500 px-1.5 text-[11px] font-medium text-maroon-900" title="Pending access requests">
              {counts.accessRequests}
            </span>
          ) : null}
        </Link>
      ))}
      <div className="mt-4 border-t border-line pt-4">
        <Link
          href="/outbox"
          aria-current={isActive(pathname, "/outbox") ? "page" : undefined}
          className={linkClass(isActive(pathname, "/outbox"))}
        >
          <Inbox className="size-4" aria-hidden />
          <span className="flex-1">Email outbox</span>
          {counts.outboxFailed > 0 ? <span className="rounded-full bg-p0 px-1.5 text-[11px] text-white">{counts.outboxFailed}</span> : null}
        </Link>
        <Link
          href="/account"
          aria-current={isActive(pathname, "/account") ? "page" : undefined}
          className={linkClass(isActive(pathname, "/account"))}
        >
          <UserCog className="size-4" aria-hidden />
          <span className="flex-1">My account</span>
        </Link>
        <Link href="/guide" aria-current={isActive(pathname, "/guide") ? "page" : undefined} className={linkClass(isActive(pathname, "/guide"))}>
          <BookOpen className="size-4" aria-hidden />
          <span className="flex-1">User guide</span>
        </Link>
        <HelpTrigger variant="sidebar" label="Help & support" />
        <HelpTrigger variant="sidebar" view="feature" />
      </div>
    </nav>
  );

  const brand = (compact: boolean) => (
    <Link href="/" className="flex items-center gap-3" aria-label="CAEDM News Desk home">
      <Image
        src="/caedm-logo.png"
        alt="The Catholic Archdiocese of Edmonton"
        width={310}
        height={144}
        priority
        className={compact ? "h-9 w-auto" : "h-auto w-[172px]"}
      />
      {compact ? <span className="border-l border-line pl-3 font-serif text-base font-semibold text-maroon-700">News Desk</span> : null}
    </Link>
  );

  const userBox = (
    <div className="border-t border-line pt-4">
      <div className="truncate text-sm font-medium text-ink">{user.name || user.email}</div>
      <div className="truncate text-xs text-muted">
        {roleLabel} · {user.email}
      </div>
      <form action={logoutAction} className="mt-2">
        <button className="flex items-center gap-1.5 text-xs text-muted hover:text-maroon-800" type="submit">
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
        <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-6 border-r border-line bg-surface px-4 pb-6 pt-7 lg:flex">
          <div aria-hidden className="brand-stripe absolute inset-x-0 top-0 h-1" />
          <div>
            {brand(false)}
            <div className="mt-3 border-t border-gold-500 pt-2 font-serif text-[15px] font-semibold tracking-wide text-maroon-700">News Desk</div>
          </div>
          <div className="flex-1">{nav}</div>
          {userBox}
        </aside>
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
          <div aria-hidden className="brand-stripe absolute inset-x-0 top-0 h-1" />
          {brand(true)}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="rounded-md p-2 text-ink hover:bg-maroon-50"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </header>
        {open ? (
          <div id="mobile-nav" className="fixed inset-x-0 top-[61px] z-20 flex flex-col gap-6 border-b border-line bg-surface px-4 pb-6 pt-2 shadow-lg lg:hidden">
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
