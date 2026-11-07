import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import { IconCamera, IconCheck } from "@tabler/icons-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Seal } from "@/components/feedesk/Seal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";
import { flagLine, ghsText } from "@/lib/explain-flag";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: `Overview - ${APP_TITLE}` }];
}

const fieldClass =
  "h-9 w-full rounded-[var(--radius)] border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashboardRoute() {
  useSetPageTitle("Overview");
  const receipts = useActionQuery("list-receipts", { limit: 12 });
  const summary = useActionQuery("get-summary", {});
  const flags = useActionQuery("list-flags", { includeResolved: "false" });
  const school = useActionQuery("get-school-settings", {}).data;
  const s = summary.data;
  const totals = receipts.data?.totals;

  const quickCheck = useActionMutation("run-check", {
    onSuccess: (r) => toast.success(r.message),
    onError: (error) => toast.error(actionErrorMessage(error) ?? "The check didn't finish. Try again."),
  });

  function checkWithAgent() {
    sendToAgentChat({
      message: "Check everything: match every unchecked receipt to the money that paid for it, and flag only the problems.",
      submit: true,
      openSidebar: true,
    });
  }

  const canCheck = !!s && s.receipts > 0 && !quickCheck.isPending;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-[1100px] flex-col px-5 pb-16 pt-9 sm:px-12">
        {/* Masthead */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {school ? [school.schoolName, school.termLabel].filter(Boolean).join(" · ") : " "}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {s && s.receipts > 0 && s.unchecked === 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <IconCheck className="size-4" strokeWidth={2} /> Every receipt checked
              </span>
            )}
            <button
              type="button"
              onClick={() => quickCheck.mutate({})}
              disabled={!canCheck}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:no-underline disabled:opacity-50"
              title="Runs the same matching rules directly, without the AI agent (uses no AI credits)"
            >
              {quickCheck.isPending ? "Checking…" : "Check without AI"}
            </button>
            <Button onClick={checkWithAgent} disabled={!s || s.receipts === 0 || quickCheck.isPending}>
              Check everything
            </Button>
          </div>
        </header>

        {/* Hero: one number, the seal */}
        <section
          aria-label="Where things stand"
          className="feedesk-underprint relative mt-6 grid items-center gap-8 rounded-sm py-6 md:grid-cols-[1fr_300px] md:-mx-8 md:px-8"
        >
          <Hero s={s} />
          <Seal
            label={s && s.verified > 0 ? "verified" : "waiting"}
            className={cn("hidden w-[300px] md:block", (!s || s.verified === 0) && "opacity-35")}
          />
        </section>

        {/* What needs the bursar */}
        <NeedsYou flags={flags.data?.flags} loading={flags.isLoading} unchecked={s?.unchecked ?? 0} receipts={s?.receipts ?? 0} />

        {/* Bringing things in */}
        <section className="mt-16">
          <div className="flex items-baseline justify-between border-t-[1.5px] border-foreground pt-4">
            <h2 className="font-display text-2xl font-semibold">Receipts and statements</h2>
            <p className="tabular text-sm text-muted-foreground">
              {totals ? `${totals.students} students · ${totals.momoLines} MoMo lines · ${totals.bankLines} bank deposits` : ""}
            </p>
          </div>
          <div className="mt-2 grid sm:grid-cols-3 sm:divide-x sm:divide-rule">
            <UploadLine title="Fee list" hint="students.csv" kind="students" />
            <UploadLine title="MoMo statement" hint="merchant statement CSV" kind="momo" />
            <UploadLine title="Bank statement" hint="bank statement CSV" kind="bank" />
          </div>
          <div className="mt-10 grid gap-12 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <AddReceiptForm />
            <section className="flex min-w-0 flex-col">
              <h3 className="font-display text-xl font-semibold">Latest receipts</h3>
              <ReceiptsTable data={receipts.data?.receipts} loading={receipts.isLoading} />
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}

interface SummaryData {
  receipts: number;
  verified: number;
  unchecked: number;
  studentsOwing: number;
  verifiedGhs: string;
  owedGhs: string;
}

function Hero({ s }: { s: SummaryData | undefined }) {
  if (!s) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-36 w-80" />
        <Skeleton className="h-7 w-96" />
      </div>
    );
  }
  const big = "font-display font-bold leading-[0.82] tracking-[-0.035em] text-[clamp(96px,13vw,168px)] tabular";
  if (s.receipts === 0) {
    return (
      <div>
        <p className={big}>0</p>
        <p className="mt-5 max-w-xl font-display text-[27px] leading-tight">receipts so far. Bring in the fee list, the statements and the receipt book below.</p>
      </div>
    );
  }
  if (s.verified === 0) {
    return (
      <div>
        <p className={big}>{s.unchecked}</p>
        <p className="mt-5 max-w-xl font-display text-[27px] leading-tight">
          receipts are waiting to be checked against the money that <em className="whitespace-nowrap text-oxblood">actually arrived</em>.
        </p>
        <p className="tabular mt-3 text-sm text-muted-foreground">Nothing verified yet · {s.studentsOwing} students on the fee list</p>
      </div>
    );
  }
  return (
    <div>
      <p className={big}>
        {s.verified}
        <span className="font-normal text-muted-foreground" style={{ fontSize: "0.38em", letterSpacing: "-0.02em" }}>
          {" "}/ {s.receipts}
        </span>
      </p>
      <p className="mt-5 max-w-[36rem] font-display text-[27px] leading-tight">
        receipts are backed by money that <em className="whitespace-nowrap text-oxblood">actually arrived</em>.
      </p>
      <p className="tabular mt-3 text-sm text-muted-foreground">
        {ghsText(s.verifiedGhs)} matched · {s.studentsOwing} students still owe {ghsText(s.owedGhs)}
        {s.unchecked > 0 ? ` · ${s.unchecked} not checked yet` : ""}
      </p>
    </div>
  );
}

type FlagItem = Parameters<typeof flagLine>[0] & { id: string };

function NeedsYou({
  flags,
  loading,
  unchecked,
  receipts,
}: {
  flags: FlagItem[] | undefined;
  loading: boolean;
  unchecked: number;
  receipts: number;
}) {
  if (loading) return <Skeleton className="mt-12 h-40 w-full" />;
  const n = flags?.length ?? 0;
  if (n === 0) {
    if (receipts === 0) return null;
    return (
      <section className="mt-12 border-t-[1.5px] border-foreground pt-4">
        <h2 className="font-display text-2xl font-semibold">{unchecked > 0 ? "Not checked yet" : "Nothing needs you"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {unchecked > 0
            ? `${unchecked} receipts are waiting. Check them and only the mismatches will come back here.`
            : "Every receipt is either backed by money or has been decided on."}
        </p>
      </section>
    );
  }
  return (
    <section className="mt-12 border-t-[1.5px] border-foreground">
      <div className="flex items-baseline justify-between pb-1 pt-4">
        <h2 className="font-display text-2xl font-semibold">
          {n} need{n === 1 ? "s" : ""} you
        </h2>
        <Link to="/flags" className="text-sm font-semibold text-oxblood hover:underline">
          Review all →
        </Link>
      </div>
      <ul>
        {flags!.slice(0, 4).map((f) => {
          const l = flagLine(f);
          return (
            <li key={f.id} className="grid grid-cols-[72px_1fr] items-baseline gap-x-5 gap-y-1 border-b border-rule py-3 text-[15px] sm:grid-cols-[88px_1fr_auto]">
              <span className="tabular font-display text-lg italic text-muted-foreground">
                {l.ref === "—" ? "—" : `№ ${l.ref}`}
              </span>
              <span>{l.line}</span>
              <Link to={`/flags?flag=${f.id}`} className="col-start-2 whitespace-nowrap text-sm font-semibold text-oxblood hover:underline sm:col-start-auto">
                {l.action}
              </Link>
            </li>
          );
        })}
      </ul>
      {n > 4 && (
        <p className="pt-3 text-sm text-muted-foreground">
          and {n - 4} more on the <Link to="/flags" className="underline">review page</Link>.
        </p>
      )}
    </section>
  );
}

function UploadLine({ title, hint, kind }: { title: string; hint: string; kind: "students" | "momo" | "bank" }) {
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
      className="group flex items-baseline justify-between gap-3 border-b border-rule py-3 text-left sm:border-b-0 sm:px-5 sm:first:pl-0 disabled:opacity-60"
    >
      <span className="flex flex-col">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className="text-sm font-semibold text-oxblood group-hover:underline">{pending ? "Importing…" : "Upload"}</span>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
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
    <section className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-xl font-semibold">Write a receipt</h3>
      </div>
      <Button asChild className="mt-3 h-11 justify-start gap-2 text-[15px]">
        <Link to="/capture">
          <IconCamera className="size-5" strokeWidth={1.7} /> Snap a receipt page
        </Link>
      </Button>
      <p className="mt-2 text-sm text-muted-foreground">The agent reads every row; you check them before anything is saved. Or type one below.</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt-no">Receipt №</Label>
            <Input id="receipt-no" inputMode="numeric" required value={form.receiptNo} onChange={(e) => set("receiptNo", e.target.value)} placeholder="e.g. 1120" className="tabular bg-card" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt-date">Date on the receipt</Label>
            <Input id="receipt-date" type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} className="tabular bg-card" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="receipt-student">Student</Label>
          <select id="receipt-student" required className={fieldClass} value={form.studentId} onChange={(e) => set("studentId", e.target.value)}>
            <option value="" disabled>
              {studentsQuery.isLoading ? "Loading students…" : students.length ? "Choose a student" : "Upload the fee list first"}
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
              placeholder="e.g. 450.00"
              className="tabular bg-card"
            />
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Paid by</legend>
            <div className="flex h-9 overflow-hidden rounded-[var(--radius)] border border-input text-sm">
              {(["cash", "momo"] as const).map((m) => (
                <label
                  key={m}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center justify-center",
                    form.method === m ? "bg-foreground text-background" : "bg-card hover:bg-accent",
                  )}
                >
                  <input type="radio" name="method" value={m} className="sr-only" checked={form.method === m} onChange={() => set("method", m)} />
                  {m === "cash" ? "Cash" : "MoMo"}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <Button type="submit" variant="outline" disabled={addReceipt.isPending} className="border-foreground">
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
  status: string;
}

const dayShort = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function ReceiptsTable({ data, loading }: { data: ReceiptRow[] | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  if (!data?.length) {
    return <p className="mt-4 text-sm text-muted-foreground">No receipts yet. Write one, upload a CSV, or send the agent a photo of a receipt-book page.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b border-foreground/70">
            <th className="py-2 pr-3 font-medium">№</th>
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Student</th>
            <th className="py-2 pr-3 text-right font-medium">GHS</th>
            <th className="py-2 pr-3 font-medium">Paid by</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} className="border-b border-rule">
              <td className="tabular py-2 pr-3 font-display italic text-muted-foreground">{r.receiptNo}</td>
              <td className="tabular whitespace-nowrap py-2 pr-3">{dayShort(r.date)}</td>
              <td className="py-2 pr-3">
                {r.studentName} <span className="text-muted-foreground">· {r.className}</span>
              </td>
              <td className="tabular py-2 pr-3 text-right">{Number(r.amountGhs).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</td>
              <td className="py-2 pr-3">
                {r.method === "momo" ? "MoMo" : "Cash"}
                {r.source === "photo" && <span className="ml-1.5 text-xs text-muted-foreground">photo</span>}
              </td>
              <td className="whitespace-nowrap py-2">
                <Status status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Status({ status }: { status: string }) {
  if (status === "verified")
    return (
      <span className="inline-flex items-center gap-1">
        <IconCheck className="size-3.5" strokeWidth={2} /> Backed
      </span>
    );
  if (status === "flagged") return <span className="font-semibold text-oxblood">To review</span>;
  if (status === "void") return <span className="text-muted-foreground line-through">Void</span>;
  return <span className="text-muted-foreground">Not checked</span>;
}
