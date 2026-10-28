"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button, type buttonVariants } from "@/components/ui/primitives";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export type ActionState = { ok?: boolean; message?: string; error?: string } | null;

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
    <p
      role={state.error ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-[13px]",
        state.error ? "border-p0/30 bg-p0-soft text-p0" : "border-emerald-200 bg-emerald-50 text-emerald-800",
        className,
      )}
    >
      {state.error ?? state.message}
    </p>
  );
}

/**
 * A form bound to a server action that returns ActionState; shows the result inline. Submits through a
 * transition rather than `<form action>` so that React does not auto-reset the fields when the action
 * returns a validation error (the user keeps what they typed). Fields reset only on success, if asked.
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
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(form, submitter);
    startTransition(async () => {
      const result = await action(state, fd);
      setState(result);
      if (resetOnSuccess && result?.ok) form.reset();
    });
  };
  return (
    <form onSubmit={onSubmit} className={className} aria-busy={pending}>
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      <FormMessage state={state} className="mt-3" />
    </form>
  );
}
