import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import { IconMessageCircle } from "@tabler/icons-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

import { Seal } from "@/components/feedesk/Seal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";
import { ACTION, dayText, explainFlag, flagLine, flagTag, ghsText, titleCase } from "@/lib/explain-flag";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: `To review - ${APP_TITLE}` }];
}

type Resolution = "accept_match" | "fix_amount" | "void_duplicate" | "add_receipt" | "real_problem";

/** How long the seal stays on a settled entry before it leaves the list. */
const STAMP_MS = 650;

export default function FlagsRoute() {
  useSetPageTitle("To review");
  const flagsQuery = useActionQuery("list-flags", { includeResolved: "false" });
  const summary = useActionQuery("get-summary", {});
  const school = useActionQuery("get-school-settings", {}).data;
  const [params, setParams] = useSearchParams();
  const selected = params.get("flag");
  const [stamped, setStamped] = useState<Set<string>>(new Set()); // showing the seal
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // gone from the list
  // While a seal is playing, keep showing the list as it was: the save is often faster than
  // the stamp, and the refreshed list would otherwise drop the entry mid-animation.
  const [frozen, setFrozen] = useState<Flag[] | null>(null);

  const resolve = useActionMutation("resolve-flag");
  const without = (set: Set<string>, id: string) => {
    const next = new Set(set);
    next.delete(id);
    return next;
  };

  function act(flagId: string, resolution: Resolution, extra: { receiptNo?: string; note?: string } = {}) {
    // Acknowledge at once: settled entries are stamped, "problem" entries just leave.
    if (resolution === "real_problem") setHidden((h) => new Set(h).add(flagId));
    else {
      setFrozen((f) => f ?? (flagsQuery.data?.flags ?? []).filter((x) => !hidden.has(x.id)));
      setStamped((s) => new Set(s).add(flagId));
      window.setTimeout(() => {
        setHidden((h) => new Set(h).add(flagId));
        setStamped((s) => {
          const next = without(s, flagId);
          if (next.size === 0) setFrozen(null);
          return next;
        });
      }, STAMP_MS);
    }
    resolve.mutate(
      { flagId, resolution, ...extra },
      {
        onSuccess: (r) => toast.success(r.message),
        onError: (error) => {
          window.setTimeout(() => {
            setStamped((s) => without(s, flagId));
            setHidden((h) => without(h, flagId));
          }, 0);
          toast.error(actionErrorMessage(error) ?? "Couldn't apply that. Try again or ask the agent.");
        },
      },
    );
  }

  const flags = (frozen ?? flagsQuery.data?.flags ?? []).filter((f) => !hidden.has(f.id));
  const s = summary.data;
  const n = flags.length;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-[860px] flex-col px-5 pb-16 pt-9 sm:px-12">
        <header>
          <p className="text-sm text-muted-foreground">
            {school ? [school.schoolName, school.termLabel].filter(Boolean).join(" · ") : " "}
          </p>
          {flagsQuery.isLoading ? (
            <Skeleton className="mt-4 h-14 w-96" />
          ) : (
            <h1 className="mt-3 font-display text-[clamp(40px,5vw,56px)] font-semibold leading-none tracking-[-0.02em]">
              {n === 0 ? "Nothing to review" : `${n} to review`}
            </h1>
          )}
          {s && n > 0 && <p className="tabular mt-3 text-[15px]">{breakdown(flags)}</p>}
          {s && (
            <p className="tabular mt-1 text-sm text-muted-foreground">
              {s.verified} of {s.receipts} receipts are backed by money · {s.studentsOwing} students owe {ghsText(s.owedGhs)}
            </p>
          )}
        </header>

        {flagsQuery.isLoading ? (
          <div className="mt-10 flex flex-col gap-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : n === 0 ? (
          <section className="mt-10 grid items-center gap-8 border-t-[1.5px] border-foreground pt-8 sm:grid-cols-[1fr_200px]">
            <p className="max-w-md font-display text-2xl leading-snug">
              {s && s.unchecked > 0 ? (
                <>
                  {s.unchecked} receipts haven't been checked yet. Check them from the{" "}
                  <Link to="/dashboard" className="text-oxblood underline underline-offset-4">Overview</Link>.
                </>
              ) : (
                <>Every receipt is backed by money or has a decision on it.</>
              )}
            </p>
            {s && s.unchecked === 0 && <Seal label="all square" className="w-[200px]" />}
          </section>
        ) : (
          <ol className="mt-8 border-t-[1.5px] border-foreground">
            {flags.map((f) => (
              <FlagEntry
                key={f.id}
                flag={f}
                selected={selected === f.id}
                stamped={stamped.has(f.id)}
                onSelect={() => setParams(selected === f.id ? {} : { flag: f.id }, { replace: true })}
                onResolve={(resolution, extra) => act(f.id, resolution, extra)}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/** "11 about receipts (13 receipts) · 7 payments with no receipt" — what the count is made of. */
function breakdown(flags: Flag[]): string {
  const payments = flags.filter((f) => f.kind === "no_receipt").length;
  const aboutReceipts = flags.length - payments;
  const receiptCount = flags
    .filter((f) => f.kind !== "no_receipt")
    .reduce((t, f) => t + (f.proposedMatch?.receipts.filter(Boolean).length || (f.receipt ? 1 : 0)), 0);
  const parts = [];
  if (aboutReceipts) parts.push(`${aboutReceipts} about receipts${receiptCount !== aboutReceipts ? ` (${receiptCount} receipts)` : ""}`);
  if (payments) parts.push(`${payments} payment${payments === 1 ? "" : "s"} with no receipt`);
  return parts.join(" · ");
}

interface FlagReceipt {
  receiptNo: string;
  date: string;
  studentName: string;
  className: string;
  amountGhs: string;
  method: string;
}
interface Flag {
  id: string;
  kind: string;
  note: string;
  receipt: FlagReceipt | null;
  moneyLine: {
    moneyRef: string;
    source: string;
    date: string;
    payerName: string | null;
    payerPhone: string | null;
    amountGhs: string;
    reference: string | null;
  } | null;
  proposedMatch: { receipts: (FlagReceipt | null)[] } | null;
  likelyStudent: { id: string; name: string; className: string } | null;
}

function FlagEntry({
  flag: f,
  selected,
  stamped,
  onSelect,
  onResolve,
}: {
  flag: Flag;
  selected: boolean;
  stamped: boolean;
  onSelect: () => void;
  onResolve: (r: Resolution, extra?: { receiptNo?: string; note?: string }) => void;
}) {
  const [receiptNo, setReceiptNo] = useState("");
  const ex = explainFlag(f);
  const line = flagLine(f);
  const receipts = (f.proposedMatch?.receipts?.filter(Boolean) as FlagReceipt[] | undefined) ?? (f.receipt ? [f.receipt] : []);
  const subject = f.receipt ? `receipt ${f.receipt.receiptNo}` : `the ${ghsText(f.moneyLine?.amountGhs ?? "0")} payment`;

  function askAgent(prefill?: string) {
    sendToAgentChat({
      message: prefill ?? `About ${subject}: `,
      context: JSON.stringify({ flagId: f.id, kind: f.kind }),
      submit: false,
      openSidebar: true,
    });
  }

  function addReceipt(e: FormEvent) {
    e.preventDefault();
    if (receiptNo.trim()) onResolve("add_receipt", { receiptNo: receiptNo.trim() });
  }

  return (
    <li
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "relative grid cursor-pointer gap-x-6 gap-y-3 border-b border-rule py-6 transition-colors sm:grid-cols-[110px_1fr]",
        selected && "bg-card shadow-[inset_3px_0_0_hsl(var(--oxblood))] sm:-mx-4 sm:px-4",
        stamped && "pointer-events-none",
      )}
    >
      {/* Left column: the engraved receipt number */}
      <div className="flex items-baseline justify-between sm:block">
        <span className="tabular font-display text-[26px] italic leading-none text-muted-foreground">
          {line.ref === "—" ? "—" : `№ ${line.ref}`}
        </span>
        <span className={cn("text-xs font-semibold sm:mt-2 sm:block", ex.tone === "red" ? "text-oxblood" : "text-muted-foreground")}>
          {flagTag(f)}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <h2 className="font-display text-[22px] font-semibold leading-tight">{ex.title}</h2>

        {/* The two sides, side by side: what was written, what arrived */}
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Written in the receipt book</p>
            {receipts.length ? (
              receipts.map((r) => (
                <p key={r.receiptNo} className="mt-1">
                  <span className="tabular font-semibold">{ghsText(r.amountGhs)}</span> {r.method === "momo" ? "MoMo" : "cash"} ·{" "}
                  {r.studentName} <span className="text-muted-foreground">({r.className})</span>
                  <span className="tabular block text-muted-foreground">
                    № {r.receiptNo} · {dayText(r.date)}
                  </span>
                </p>
              ))
            ) : (
              <p className="mt-1 text-muted-foreground">Nothing written</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">What actually arrived</p>
            {f.moneyLine ? (
              <p className="mt-1">
                <span className="tabular font-semibold">{ghsText(f.moneyLine.amountGhs)}</span>{" "}
                {f.moneyLine.source === "momo" ? "by MoMo" : "bank deposit"} · {dayText(f.moneyLine.date)}
                <span className="block text-muted-foreground">
                  {f.moneyLine.source === "momo"
                    ? [f.moneyLine.payerName && titleCase(f.moneyLine.payerName), f.moneyLine.payerPhone].filter(Boolean).join(" · ")
                    : "Cash deposit at the bank"}
                  {f.moneyLine.reference && f.moneyLine.source === "momo" ? ` · “${f.moneyLine.reference}”` : ""}
                </span>
              </p>
            ) : (
              <p className="mt-1 font-semibold text-oxblood">Nothing found</p>
            )}
          </div>
        </div>

        <p className="text-[15px] leading-relaxed">
          {ex.happened} <span className="text-muted-foreground">{ex.todo}</span>
        </p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3" onClick={(e) => e.stopPropagation()}>
          {f.kind === "amount_diff" && f.moneyLine && (
            <Button size="sm" onClick={() => onResolve("fix_amount")}>
              {ACTION.fixTo(f.moneyLine.amountGhs)}
            </Button>
          )}
          {f.kind === "no_money" && f.proposedMatch && (
            <Button size="sm" onClick={() => onResolve("accept_match", { note: "Confirmed banked from the review page" })}>
              {ACTION.confirmDeposit}
            </Button>
          )}
          {f.kind === "no_money" && !f.proposedMatch && (
            <Button size="sm" variant="outline" className="border-foreground" onClick={() => askAgent(`Receipt ${f.receipt?.receiptNo} was banked separately, in the deposit of `)}>
              {ACTION.bankedSeparately}
            </Button>
          )}
          {f.kind === "duplicate" && (
            <Button size="sm" onClick={() => onResolve("void_duplicate")}>
              {ACTION.voidDuplicate}
            </Button>
          )}
          {f.kind === "no_receipt" && (
            <form onSubmit={addReceipt} className="flex items-center gap-2">
              <Input
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                placeholder="Receipt №"
                inputMode="numeric"
                className="tabular h-8 w-28 bg-card"
                aria-label="Number of the receipt to write"
              />
              <Button size="sm" type="submit" disabled={!receiptNo.trim()}>
                {ACTION.writeReceipt}{f.likelyStudent ? ` for ${f.likelyStudent.name.split(" ")[0]}` : ""}
              </Button>
            </form>
          )}
          <button type="button" onClick={() => onResolve("real_problem")} className="text-sm font-semibold underline-offset-4 hover:underline">
            {ACTION.realProblem}
          </button>
          <button type="button" onClick={() => askAgent()} className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <IconMessageCircle className="size-4" strokeWidth={1.6} /> Ask the agent
          </button>
        </div>

        <details className="text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          <summary className="cursor-pointer select-none">Evidence the check used</summary>
          <p className="mt-1">{f.note}</p>
        </details>
      </div>

      {stamped && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-end bg-background/60 pr-6">
          <Seal label="settled" stamp className="w-36" strokeWidth={0.9} />
        </div>
      )}
    </li>
  );
}
