"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";

type LiveStatus = { latestId: number; newStories: number; newHighPriority: number; lastRefreshAt: number | null; refreshing: boolean };

const POLL_MS = 60_000;

function ago(ts: number | null) {
  if (!ts) return "not yet";
  const m = Math.round((Date.now() - ts) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/**
 * Polls /api/live while the tab is visible. The server refreshes due sources in the background, and new
 * stories are announced with a banner rather than reloading the page under the reader.
 */
export function LiveUpdates({ initialLatestId, initialLastRefreshAt }: { initialLatestId: number; initialLastRefreshAt: number | null }) {
  const router = useRouter();
  const [since, setSince] = React.useState(initialLatestId);
  const [status, setStatus] = React.useState<LiveStatus | null>(null);
  const [, forceTick] = React.useReducer((n: number) => n + 1, 0);
  const sinceRef = React.useRef(since);
  sinceRef.current = since;

  const poll = React.useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch(`/api/live?since=${sinceRef.current}`, { cache: "no-store" });
      if (res.status === 401) return router.refresh(); // session ended → server redirects to sign-in
      if (res.ok) setStatus(await res.json());
    } catch {
      /* offline; try again next interval */
    }
  }, [router]);

  React.useEffect(() => {
    void poll();
    const id = setInterval(poll, POLL_MS);
    const clock = setInterval(forceTick, 30_000);
    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  // While a background refresh is running, check again sooner so results appear promptly.
  React.useEffect(() => {
    if (!status?.refreshing) return;
    const t = setTimeout(poll, 20_000);
    return () => clearTimeout(t);
  }, [status, poll]);

  const showNew = () => {
    if (status) setSince(status.latestId);
    setStatus((s) => (s ? { ...s, newStories: 0, newHighPriority: 0 } : s));
    router.refresh();
  };

  return (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-3" data-testid="live-updates">
      {status && status.newStories > 0 ? (
        <button
          type="button"
          onClick={showNew}
          role="status"
          className={cn(
            "mr-auto inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-white shadow-sm",
            status.newHighPriority ? "bg-p0 hover:bg-p0/90" : "bg-navy-700 hover:bg-navy-800",
          )}
        >
          {status.newStories} new {status.newStories === 1 ? "story" : "stories"}
          {status.newHighPriority ? ` · ${status.newHighPriority} high priority` : ""} · Show
        </button>
      ) : null}
      <span className="inline-flex items-center gap-1.5 text-xs text-subtle" aria-live="polite" suppressHydrationWarning>
        {status?.refreshing ? (
          <>
            <RefreshCw className="size-3.5 animate-spin" aria-hidden /> Checking sources…
          </>
        ) : (
          <>
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Live · sources checked{" "}
            {ago(status ? status.lastRefreshAt : initialLastRefreshAt)}
          </>
        )}
      </span>
    </div>
  );
}
