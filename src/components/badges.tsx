import { AlertTriangle, BadgeCheck, CircleHelp, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { CATEGORY_LABELS, cn, PRIORITY_LABELS, STATUS_LABELS, VERIFICATION_LABELS } from "@/lib/utils";

const PRIORITY_STYLES: Record<string, string> = {
  P0: "border-p0/30 bg-p0-soft text-p0",
  P1: "border-p1/30 bg-p1-soft text-p1",
  P2: "border-p2/25 bg-p2-soft text-p2",
  P3: "border-p3/25 bg-p3-soft text-p3",
};

export function PriorityBadge({ priority, overridden, compact }: { priority: string; overridden?: boolean; compact?: boolean }) {
  return (
    <Badge className={cn("font-semibold", PRIORITY_STYLES[priority])} title={overridden ? "Priority set manually" : "Automatic priority"}>
      {priority}
      {compact ? null : <span className="font-medium">{PRIORITY_LABELS[priority]}</span>}
      {overridden ? <span aria-label="manually set">•</span> : null}
    </Badge>
  );
}

const STATUS_STYLES: Record<string, string> = {
  new: "border-navy-100 bg-navy-50 text-navy-700",
  reviewing: "border-amber-200 bg-amber-50 text-amber-800",
  assigned: "border-violet-200 bg-violet-50 text-violet-800",
  covered: "border-emerald-200 bg-emerald-50 text-emerald-800",
  archived: "border-line bg-paper text-muted",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={STATUS_STYLES[status]}>{STATUS_LABELS[status] ?? status}</Badge>;
}

export function CategoryBadge({ category }: { category: string }) {
  return <Badge className="border-line bg-paper text-muted">{CATEGORY_LABELS[category] ?? category}</Badge>;
}

export function VerificationBadge({ status, sensitive }: { status: string; sensitive?: boolean }) {
  return (
    <>
      {sensitive ? (
        <Badge className="border-orange-300 bg-orange-50 text-orange-800" title="Sensitive subject: requires human review before any external use">
          <AlertTriangle className="size-3" /> Needs human review
        </Badge>
      ) : null}
      {status === "unverified" ? (
        <Badge className="border-orange-200 bg-orange-50 text-orange-800">
          <CircleHelp className="size-3" /> {VERIFICATION_LABELS[status]}
        </Badge>
      ) : status === "verified_by_staff" ? (
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
          <BadgeCheck className="size-3" /> {VERIFICATION_LABELS[status]}
        </Badge>
      ) : null}
    </>
  );
}

export function SampleBadge() {
  return (
    <Badge className="border-dashed border-subtle bg-paper text-muted" title="Development sample record">
      <FlaskConical className="size-3" /> Sample
    </Badge>
  );
}

const HEALTH_STYLES = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-800",
  degraded: "border-amber-200 bg-amber-50 text-amber-800",
  failing: "border-p0/30 bg-p0-soft text-p0",
  pending: "border-navy-100 bg-navy-50 text-navy-700",
  disabled: "border-line bg-paper text-muted",
  unverified: "border-dashed border-line bg-paper text-subtle",
  manual: "border-line bg-paper text-muted",
} as const;

export type Health = keyof typeof HEALTH_STYLES;

export function sourceHealth(s: {
  enabled: boolean;
  verified: boolean;
  method: string;
  consecutiveFailures: number;
  lastSuccessAt: number | null;
}): Health {
  if (s.method === "manual") return "manual";
  if (!s.verified) return "unverified";
  if (!s.enabled) return "disabled";
  if (s.consecutiveFailures >= 3) return "failing";
  if (s.consecutiveFailures > 0) return "degraded";
  if (!s.lastSuccessAt) return "pending";
  return "healthy";
}

const HEALTH_LABEL: Record<Health, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  failing: "Failing",
  pending: "Awaiting first check",
  disabled: "Disabled",
  unverified: "Not verified",
  manual: "Manual",
};

export function HealthBadge({ health }: { health: Health }) {
  return (
    <Badge className={HEALTH_STYLES[health]}>
      <span className={cn("size-1.5 rounded-full bg-current")} aria-hidden />
      {HEALTH_LABEL[health]}
    </Badge>
  );
}
