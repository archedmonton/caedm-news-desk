"use client";

import { CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import * as React from "react";
import { deleteSourceAction, discoverFeedsAction, saveSourceAction, testFeedAction } from "@/actions/sources";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { CATEGORY_LABELS, GEO_LABELS } from "@/lib/utils";

type FeedTest = Awaited<ReturnType<typeof testFeedAction>>;

export type SourceFormValues = {
  id?: number;
  name: string;
  websiteUrl: string;
  feedUrl: string;
  orgType: string;
  region: string;
  importance: number;
  defaultCategory: string;
  checkIntervalMinutes: number | null;
  notes: string;
  enabled: boolean;
  adapter?: string;
  storyCount?: number;
};

export function SourceForm({
  initial,
  orgTypes,
  defaultInterval,
}: {
  initial: SourceFormValues;
  orgTypes: Record<string, string>;
  defaultInterval: number;
}) {
  const [websiteUrl, setWebsiteUrl] = React.useState(initial.websiteUrl);
  const [feedUrl, setFeedUrl] = React.useState(initial.feedUrl);
  const [feeds, setFeeds] = React.useState<{ url: string; title: string }[] | null>(null);
  const [discoverError, setDiscoverError] = React.useState<string | null>(null);
  const [test, setTest] = React.useState<FeedTest | null>(null);
  const [busy, startBusy] = React.useTransition();
  const isHtmlAdapter = initial.adapter && initial.adapter !== "rss" && initial.adapter !== "none";

  const discover = () =>
    startBusy(async () => {
      setDiscoverError(null);
      setFeeds(null);
      const r = await discoverFeedsAction(websiteUrl);
      if ("error" in r) setDiscoverError(r.error);
      else {
        setFeeds(r.feeds);
        if (r.feeds.length === 1) setFeedUrl(r.feeds[0].url);
      }
    });
  const runTest = () =>
    startBusy(async () => {
      setTest(null);
      setTest(await testFeedAction(feedUrl, initial.id));
    });

  return (
    <div className="space-y-6">
      <ActionForm action={saveSourceAction} className="space-y-6">
        {initial.id ? <input type="hidden" name="sourceId" value={initial.id} /> : null}
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization name" htmlFor="name">
            <Input id="name" name="name" required maxLength={100} defaultValue={initial.name} placeholder="e.g. Catholic Social Services" />
          </Field>
          <Field label="Website" htmlFor="websiteUrl" hint="The organization's public homepage or newsroom.">
            <Input
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              required
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
        </section>

        <section className="rounded-lg border border-line bg-paper/60 p-4">
          <Field
            label={isHtmlAdapter ? "Newsroom page" : "News feed (RSS or Atom)"}
            htmlFor="feedUrl"
            hint={
              isHtmlAdapter
                ? "This source is read with a purpose-built newsroom reader. Changing the address is re-tested before saving."
                : "Use “Find feed” to read the feed the website advertises, then “Test” to check it before saving."
            }
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="feedUrl"
                name="feedUrl"
                type="url"
                required
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://…/feed/"
              />
              {!isHtmlAdapter ? (
                <Button type="button" variant="outline" onClick={discover} disabled={busy || !websiteUrl}>
                  <Search /> Find feed
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={runTest} disabled={busy || !feedUrl}>
                {busy ? <Loader2 className="animate-spin" /> : null} Test
              </Button>
            </div>
          </Field>
          {discoverError ? <p className="mt-2 text-sm text-p1">{discoverError}</p> : null}
          {feeds && feeds.length > 1 ? (
            <div className="mt-3 text-sm">
              <p className="text-muted">The website advertises these feeds. Choose one:</p>
              <ul className="mt-1 space-y-1">
                {feeds.map((f) => (
                  <li key={f.url}>
                    <button type="button" className="text-left text-navy-700 hover:underline" onClick={() => setFeedUrl(f.url)}>
                      {f.title}: <span className="break-all text-xs">{f.url}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {test ? (
            test.ok ? (
              <div role="status" className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <p className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="size-4" /> Works: {test.itemCount} items found. Latest headlines:
                </p>
                <ul className="mt-1 list-disc pl-6 text-emerald-900/90">
                  {test.sample.map((s) => (
                    <li key={s.url}>{s.title}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-md border border-p0/25 bg-p0-soft px-3 py-2 text-sm text-p0">
                <XCircle className="mt-0.5 size-4 shrink-0" /> {test.error}
              </p>
            )
          ) : null}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Organization type" htmlFor="orgType" hint="News media items are marked unverified.">
            <Select id="orgType" name="orgType" defaultValue={initial.orgType}>
              {Object.entries(orgTypes).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Area" htmlFor="region">
            <Select id="region" name="region" defaultValue={initial.region}>
              {Object.entries(GEO_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default category" htmlFor="defaultCategory">
            <Select id="defaultCategory" name="defaultCategory" defaultValue={initial.defaultCategory}>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Importance" htmlFor="importance" hint="Raises priority a little; never makes a story urgent on its own.">
            <Select id="importance" name="importance" defaultValue={String(initial.importance)}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 5 ? "(highest)" : n === 1 ? "(lowest)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Check every (minutes)"
            htmlFor="checkIntervalMinutes"
            hint={`Blank = default (${defaultInterval} min while staff are signed in).`}
          >
            <Input
              id="checkIntervalMinutes"
              name="checkIntervalMinutes"
              type="number"
              min={15}
              max={1440}
              defaultValue={initial.checkIntervalMinutes ?? ""}
            />
          </Field>
          <Field label="Notes (optional)" htmlFor="notes" className="sm:col-span-2 lg:col-span-3">
            <Textarea
              id="notes"
              name="notes"
              maxLength={1000}
              rows={2}
              defaultValue={initial.notes}
              placeholder="e.g. Official newsroom; confirmed with their communications office."
            />
          </Field>
        </section>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="enabled" defaultChecked={initial.enabled} /> Monitor this source
        </label>
        <p className="text-xs text-muted">
          Saving checks the address the same way monitoring does (it must allow automated reading in robots.txt and return news items). Only
          headlines, the publisher&apos;s short summaries and links are stored.
        </p>
        <SubmitButton pendingText="Verifying and saving…">{initial.id ? "Save changes" : "Add source"}</SubmitButton>
      </ActionForm>

      {initial.id ? (
        <div className="border-t border-line pt-5">
          {initial.storyCount ? (
            <p className="text-sm text-muted">
              This source has {initial.storyCount} stories, so it can&apos;t be deleted. Untick “Monitor this source” to stop checking it.
            </p>
          ) : (
            <ActionForm action={deleteSourceAction}>
              <input type="hidden" name="sourceId" value={initial.id} />
              <SubmitButton variant="destructive" size="sm" pendingText="Deleting…">
                Delete source
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      ) : null}
    </div>
  );
}
