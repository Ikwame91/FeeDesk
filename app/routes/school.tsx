import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `School - ${APP_TITLE}` }];
}

export default function SchoolRoute() {
  useSetPageTitle("School");
  const query = useActionQuery("get-school-settings", {});
  const save = useActionMutation("update-school-settings", {
    onSuccess: (r) => toast.success(r.message),
    onError: (error) => toast.error(actionErrorMessage(error) ?? "Couldn't save the school settings."),
  });
  const [form, setForm] = useState({ schoolName: "", termLabel: "", momoNumber: "" });
  useEffect(() => {
    if (query.data) setForm({ schoolName: query.data.schoolName, termLabel: query.data.termLabel, momoNumber: query.data.momoNumber });
  }, [query.data]);

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(form);
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[640px] px-5 pb-16 pt-9 sm:px-12">
        <h1 className="font-display text-[clamp(36px,4.5vw,48px)] font-semibold leading-none tracking-[-0.02em]">The school</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">
          One FeeDesk belongs to one school. These details appear on every page, and the MoMo number tells FeeDesk which money in a
          statement was paid <em>to</em> the school.
        </p>

        {query.isLoading ? (
          <Skeleton className="mt-8 h-64 w-full" />
        ) : (
          <form onSubmit={submit} className="mt-8 flex flex-col gap-6 border-t-[1.5px] border-foreground pt-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-name">School name</Label>
              <Input
                id="school-name"
                required
                maxLength={120}
                value={form.schoolName}
                onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
                className="bg-card"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-term">Current term</Label>
              <Input
                id="school-term"
                maxLength={60}
                placeholder="e.g. First term 2026/27"
                value={form.termLabel}
                onChange={(e) => setForm((f) => ({ ...f, termLabel: e.target.value }))}
                className="bg-card"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-momo">School MoMo number</Label>
              <Input
                id="school-momo"
                inputMode="tel"
                placeholder="e.g. 0559000111"
                value={form.momoNumber}
                onChange={(e) => setForm((f) => ({ ...f, momoNumber: e.target.value }))}
                className="tabular bg-card"
              />
              <p className="text-xs text-muted-foreground">
                Any format works (0559000111, 233559000111, +233 55 900 0111). Needed to import MTN's own statement export, which also
                lists money going out.
              </p>
            </div>
            <div>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
