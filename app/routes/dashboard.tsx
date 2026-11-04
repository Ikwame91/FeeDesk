import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import { IconArrowRight, IconFileUpload, IconSparkles } from "@tabler/icons-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Dashboard - ${APP_TITLE}` }];
}

const fieldClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashboardRoute() {
  useSetPageTitle("Dashboard");
  const receipts = useActionQuery("list-receipts", { limit: 15 });
  const summary = useActionQuery("get-summary", {});
  const totals = receipts.data?.totals;
  const s = summary.data;

  function checkEverything() {
    sendToAgentChat({
      message: "Check everything: match every unchecked receipt to the money that paid for it, and flag only the problems.",
      submit: true,
      openSidebar: true,
    });
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8 sm:px-8">
        <section aria-label="Where things stand" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="grid grid-cols-3 gap-8">
              <Count label={`of ${s?.receipts ?? "…"} receipts verified`} value={s?.verified} accent />
              <Count label="flagged" value={s?.flagged} />
              <Count label="students owing" value={s?.studentsOwing} />
            </div>
            <div className="flex items-center gap-3">
              {s && s.openFlags > 0 && (
                <Button asChild variant="outline">
                  <Link to="/flags">
                    Review {s.openFlags} flag{s.openFlags === 1 ? "" : "s"} <IconArrowRight className="size-4" />
                  </Link>
                </Button>
              )}
              <Button onClick={checkEverything} disabled={!s || s.unchecked === 0}>
                <IconSparkles className="size-4" /> Check everything
              </Button>
            </div>
          </div>
          <div aria-label="What's recorded" className="text-sm text-muted-foreground">
            {totals ? (
              <>
                {totals.students} students · {totals.momoLines} MoMo lines · {totals.bankLines} bank lines
                {s ? ` · ${s.unchecked} receipts not checked yet` : ""}
              </>
            ) : (
              <Skeleton className="h-4 w-72" />
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Bring in data</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <UploadSlot title="Fee list" hint="students.csv" kind="students" />
            <UploadSlot title="MoMo statement" hint="Merchant statement CSV" kind="momo" />
            <UploadSlot title="Bank statement" hint="Bank statement CSV" kind="bank" />
          </div>
        </section>

        <div className="grid gap-10 2xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <AddReceiptForm />
          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Latest receipts</h2>
            <ReceiptsTable data={receipts.data?.receipts} loading={receipts.isLoading} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Count({ label, value, accent }: { label: string; value: number | undefined; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      {value === undefined ? (
        <Skeleton className="h-10 w-16" />
      ) : (
        <span className={`text-4xl font-semibold tabular-nums tracking-tight ${accent ? "text-primary" : ""}`}>{value}</span>
      )}
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function UploadSlot({ title, hint, kind }: { title: string; hint: string; kind: "students" | "momo" | "bank" }) {
  const input = useRef<HTMLInputElement>(null);
  const onError = (error: unknown) => toast.error(actionErrorMessage(error) ?? `Couldn't import the ${title.toLowerCase()}.`);
  const students = useActionMutation("import-students", { onError });
  const statement = useActionMutation("import-statement", { onError });
  const pending = students.isPending || statement.isPending;

  async function onFile(file: File | undefined) {
    if (!file) return;
    const csv = await file.text();
    const onSuccess = (r: { message: string }) => toast.success(r.message);
    if (kind === "students") students.mutate({ csv }, { onSuccess });
    else statement.mutate({ source: kind, csv }, { onSuccess });
    if (input.current) input.current.value = "";
  }

  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      disabled={pending}
      className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-left transition-colors hover:bg-accent disabled:opacity-60"
    >
      <IconFileUpload className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{pending ? "Importing…" : title}</span>
        <span className="truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
    </button>
  );
}

function AddReceiptForm() {
  const studentsQuery = useActionQuery("list-students", {});
  const students = useMemo(
    () => [...(studentsQuery.data?.students ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [studentsQuery.data],
  );
  const empty = { receiptNo: "", date: todayIso(), studentId: "", amountGhs: "", method: "cash" as "cash" | "momo" };
  const [form, setForm] = useState(empty);
  const set = <K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const addReceipt = useActionMutation("add-receipt", {
    onError: (error) => toast.error(actionErrorMessage(error) ?? "Couldn't add the receipt."),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    addReceipt.mutate(
      { ...form, source: "typed" },
      {
        onSuccess: (r) => {
          toast.success(r.message);
          setForm((f) => ({ ...empty, date: f.date, method: f.method }));
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">Add receipt</h2>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt-no">Receipt #</Label>
            <Input
              id="receipt-no"
              inputMode="numeric"
              required
              value={form.receiptNo}
              onChange={(e) => set("receiptNo", e.target.value)}
              placeholder="1120"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt-date">Date</Label>
            <Input id="receipt-date" type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="receipt-student">Student</Label>
          <select
            id="receipt-student"
            required
            className={fieldClass}
            value={form.studentId}
            onChange={(e) => set("studentId", e.target.value)}
          >
            <option value="" disabled>
              {studentsQuery.isLoading ? "Loading students…" : students.length ? "Choose a student" : "Import the fee list first"}
            </option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.className}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt-amount">Amount (GHS)</Label>
            <Input
              id="receipt-amount"
              inputMode="decimal"
              required
              pattern="[0-9,]+(\.[0-9]{1,2})?"
              title="An amount like 450.50"
              value={form.amountGhs}
              onChange={(e) => set("amountGhs", e.target.value)}
              placeholder="450.00"
            />
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Paid by</legend>
            <div className="flex h-9 overflow-hidden rounded-md border text-sm">
              {(["cash", "momo"] as const).map((m) => (
                <label
                  key={m}
                  className={`flex flex-1 cursor-pointer items-center justify-center ${form.method === m ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  <input
                    type="radio"
                    name="method"
                    value={m}
                    className="sr-only"
                    checked={form.method === m}
                    onChange={() => set("method", m)}
                  />
                  {m === "cash" ? "Cash" : "MoMo"}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <Button type="submit" disabled={addReceipt.isPending}>
          {addReceipt.isPending ? "Adding…" : "Add receipt"}
        </Button>
      </form>
    </section>
  );
}

interface ReceiptRow {
  id: string;
  receiptNo: string;
  date: string;
  studentName: string;
  className: string;
  amountGhs: string;
  method: string;
  source: string;
}

function ReceiptsTable({ data, loading }: { data: ReceiptRow[] | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (!data?.length) {
    return <p className="rounded-lg border p-6 text-sm text-muted-foreground">No receipts yet. Add one, or import data above.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Student</th>
            <th className="px-3 py-2 text-right font-medium">GHS</th>
            <th className="px-3 py-2 font-medium">Paid by</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="px-3 py-2 tabular-nums">{r.receiptNo}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.date}</td>
              <td className="px-3 py-2">
                {r.studentName} <span className="text-muted-foreground">· {r.className}</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {Number(r.amountGhs).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2">
                {r.method === "momo" ? "MoMo" : "Cash"}
                {r.source !== "upload" && <span className="ml-1.5 text-xs text-muted-foreground">({r.source})</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
