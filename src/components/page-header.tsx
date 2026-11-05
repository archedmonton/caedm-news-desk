import type * as React from "react";
import { HelpTrigger } from "@/components/help";

/** Every page gets a Help button for its own help; pass `help={false}` to supply a custom one in `actions`. */
export function PageHeader({
  title,
  description,
  actions,
  help = true,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  help?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {help ? <HelpTrigger /> : null}
        {actions}
      </div>
    </div>
  );
}
