"use client";

import { Loader2 } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button, type buttonVariants } from "@/components/ui/primitives";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** `notificationId`: an email the action queued; the form then shows its live delivery status. */
export type ActionState = { ok?: boolean; message?: string; error?: string; notificationId?: number } | null;

const PendingContext = React.createContext(false);

export function SubmitButton({
  children,
  pendingText,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { pendingText?: string }) {
  const formStatus = useFormStatus();
  const contextPending = React.useContext(PendingContext);
  const pending = formStatus.pending || contextPending;
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  if (!state || (!state.error && !state.message)) return null;
  return (
    <div className={cn("space-y-2", className)}>
      <p
        role={state.error ? "alert" : "status"}
        className={cn(
          "rounded-md border px-3 py-2 text-[13px]",
          state.error ? "border-p0/30 bg-p0-soft text-p0" : "border-emerald-200 bg-emerald-50 text-emerald-800",
        )}
      >
        {state.error ?? state.message}
      </p>
      {state.notificationId ? <DeliveryStatus key={state.notificationId} id={state.notificationId} /> : null}
    </div>
  );
}

type Delivery = { status: string; lastError: string | null; recipient: string };

const POLL_MS = 2_000;
const POLL_FOR_MS = 90_000;

/** Follows a queued email until the mail server accepts or refuses it. */
export function DeliveryStatus({ id }: { id: number }) {
  const [d, setD] = React.useState<Delivery | null>(null);
  const [gaveUp, setGaveUp] = React.useState(false);
  React.useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const poll = async () => {
      try {
        const res = await fetch(`/api/notifications/${id}`, { cache: "no-store" });
        if (res.ok) {
          const next = (await res.json()) as Delivery;
          if (stopped) return;
          setD(next);
          if (next.status !== "pending" && next.status !== "sending") return;
        }
      } catch {
        // A dropped poll is retried below.
      }
      if (stopped) return;
      if (Date.now() - started > POLL_FOR_MS) return setGaveUp(true);
      timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id]);

  const status = d?.status ?? "pending";
  const working = (status === "pending" || status === "sending") && !gaveUp;
  const text: Record<string, string> = {
    pending: "Sending the email…",
    sending: "Sending the email…",
    sent: `Email sent to ${d?.recipient}.`,
    simulated: "Saved to the Email outbox. Live email is off, so nothing was sent.",
    failed: `The email couldn't be sent yet (${d?.lastError ?? "delivery failed"}). It will be retried automatically.`,
    unknown: "The mail server didn't confirm this email. Check with the recipient before sending it again.",
    skipped: `Not sent: ${d?.lastError ?? "nothing to send"}.`,
  };
  const tone = status === "sent" || status === "simulated" ? "ok" : status === "failed" || status === "unknown" ? "warn" : "info";
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="delivery-status"
      data-status={status}
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]",
        tone === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "info" && "border-cobalt-100 bg-cobalt-50 text-cobalt-800",
      )}
    >
      {working ? <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> : null}
      <span>
        {gaveUp && (status === "pending" || status === "sending")
          ? "Still sending. You can leave this page; the result will appear in the Email outbox."
          : text[status] ?? status}{" "}
        <a href={`/outbox/${id}`} className="underline underline-offset-2">
          View in outbox
        </a>
      </span>
    </p>
  );
}

const newOpId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));

const UNCONFIRMED: ActionState = {
  error:
    "We couldn't confirm whether this finished: the connection dropped or the server took too long. Check the Email outbox before trying again. Trying again is safe: it won't send a second copy.",
};

/**
 * A form bound to a server action that returns ActionState; shows the result inline. Submits through a
 * transition rather than `<form action>` so that React does not auto-reset the fields when the action
 * returns a validation error (the user keeps what they typed). Fields reset only on success, if asked.
 *
 * Each submission carries an `opId`. It is kept when the outcome is unknown (network failure, timeout), so a
 * retry is recognised server-side as the same operation; it changes once the server has answered.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, setState] = React.useState<ActionState>(null);
  const [pending, startTransition] = React.useTransition();
  const [slow, setSlow] = React.useState(false);
  const inFlight = React.useRef(false);
  const opId = React.useRef<string | null>(null);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const form = e.currentTarget;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(form, submitter);
    opId.current ??= newOpId();
    fd.set("opId", opId.current);
    const slowTimer = setTimeout(() => setSlow(true), 15_000);
    startTransition(async () => {
      try {
        const result = await action(state, fd);
        setState(result);
        opId.current = null;
        if (resetOnSuccess && result?.ok) form.reset();
      } catch (err) {
        unstable_rethrow(err);
        setState(UNCONFIRMED);
      } finally {
        clearTimeout(slowTimer);
        setSlow(false);
        inFlight.current = false;
      }
    });
  };
  return (
    <form onSubmit={onSubmit} className={className} aria-busy={pending}>
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      {pending && slow ? (
        <p role="status" className="mt-3 text-[13px] text-muted">
          This is taking longer than usual. Please wait; don&apos;t click again.
        </p>
      ) : null}
      <FormMessage state={state} className="mt-3" />
    </form>
  );
}

/** A destructive submit that asks for a second click, so an account can't be removed by a stray click. */
export function ConfirmSubmit({ label, confirmLabel, pendingText }: { label: string; confirmLabel: string; pendingText?: string }) {
  const [armed, setArmed] = React.useState(false);
  if (!armed) {
    return (
      <Button type="button" variant="ghost" size="xs" className="text-p0 hover:text-p0" onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <SubmitButton variant="destructive" size="xs" pendingText={pendingText}>
        {confirmLabel}
      </SubmitButton>
      <Button type="button" variant="ghost" size="xs" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
