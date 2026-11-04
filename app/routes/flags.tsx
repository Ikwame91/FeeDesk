import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import { IconCircleCheck, IconMessageCircle } from "@tabler/icons-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: `Flags - ${APP_TITLE}` }];
}

const KIND_LABEL: Record<string, string> = {
  amount_diff: "Amount differs",
  no_money: "No money found",
  no_receipt: "Money with no receipt",
  duplicate: "Possible duplicate",
};

type Resolution = "accept_match" | "fix_amount" | "void_duplicate" | "add_receipt" | "real_problem";

const ghs = (amount: string) => `GHS ${Number(amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
const niceDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default function FlagsRoute() {
  useSetPageTitle("Flags");
  const flagsQuery = useActionQuery("list-flags", { includeResolved: "false" });
  const summary = useActionQuery("get-summary", {});
  const [params, setParams] = useSearchParams();
  const selected = params.get("flag");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const resolve = useActionMutation("resolve-flag");
  function act(flagId: string, resolution: Resolution, extra: { receiptNo?: string; note?: string } = {}) {
    setHidden((h) => new Set(h).add(flagId)); // acknowledge instantly; the card comes back if it fails
    resolve.mutate(
      { flagId, resolution, ...extra },
      {
        onSuccess: (r) => toast.success(r.message),
        onError: (error) => {
          setHidden((h) => {
            const next = new Set(h);
            next.delete(flagId);
            return next;
          });
          toast.error(actionErrorMessage(error) ?? "Couldn't apply that. Try again or ask the agent.");
        },
      },
    );
  }

  const flags = (flagsQuery.data?.flags ?? []).filter((f) => !hidden.has(f.id));
  const s = summary.data;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          {s ? (
            <p className="text-lg">
              <span className="text-3xl font-semibold tabular-nums">{s.verified}</span>
              <span className="text-muted-foreground"> of {s.receipts} receipts verified · </span>
              <span className="font-medium tabular-nums">{s.flagged}</span>
              <span className="text-muted-foreground"> flagged · </span>
              <span className="font-medium tabular-nums">{s.studentsOwing}</span>
              <span className="text-muted-foreground"> students owing</span>
            </p>
          ) : (
            <Skeleton className="h-9 w-80" />
          )}
          {flags.length > 0 && <span className="text-sm text-muted-foreground">{flags.length} to review</span>}
        </header>

        {flagsQuery.isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        ) : flags.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border p-10 text-center">
            <IconCircleCheck className="size-8 text-primary" strokeWidth={1.5} />
            <p className="font-medium">Nothing to review.</p>
            <p className="text-sm text-muted-foreground">
              {s && s.unchecked > 0 ? (
                <>
                  {s.unchecked} receipts haven't been checked yet. Run <Link to="/dashboard" className="underline">Check everything</Link> on
                  the Dashboard.
                </>
              ) : (
                "Every receipt has been checked."
              )}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {flags.map((f) => (
              <FlagCard
                key={f.id}
                flag={f}
                selected={selected === f.id}
                onSelect={() => setParams(selected === f.id ? {} : { flag: f.id }, { replace: true })}
                onResolve={(resolution, extra) => act(f.id, resolution, extra)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
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

function FlagCard({
  flag: f,
  selected,
  onSelect,
  onResolve,
}: {
  flag: Flag;
  selected: boolean;
  onSelect: () => void;
  onResolve: (r: Resolution, extra?: { receiptNo?: string; note?: string }) => void;
}) {
  const [receiptNo, setReceiptNo] = useState("");
  const receipts = f.proposedMatch?.receipts?.filter(Boolean) ?? (f.receipt ? [f.receipt] : []);
  const subject = f.receipt ? `receipt ${f.receipt.receiptNo}` : `the payment ${f.moneyLine?.moneyRef ?? ""}`;

  function askAgent() {
    sendToAgentChat({
      message: `About the flag on ${subject}: `,
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
      className={cn(
        "flex cursor-pointer flex-col gap-4 rounded-lg border p-5 transition-colors",
        selected ? "border-primary ring-2 ring-primary/20" : "hover:border-foreground/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{KIND_LABEL[f.kind] ?? f.kind}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            askAgent();
          }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <IconMessageCircle className="size-3.5" /> Ask the agent
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Receipt{receipts.length > 1 ? "s" : ""}</span>
          {receipts.length ? (
            receipts.map((r) => (
              <div key={r!.receiptNo} className="text-sm">
                <span className="font-medium tabular-nums">#{r!.receiptNo}</span> · {r!.studentName}{" "}
                <span className="text-muted-foreground">({r!.className})</span>
                <div className="tabular-nums text-muted-foreground">
                  {ghs(r!.amountGhs)} {r!.method === "momo" ? "MoMo" : "cash"} · {niceDate(r!.date)}
                </div>
              </div>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">None written</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Money</span>
          {f.moneyLine ? (
            <div className="text-sm">
              <span className="font-medium tabular-nums">{ghs(f.moneyLine.amountGhs)}</span>{" "}
              {f.moneyLine.source === "momo" ? "MoMo" : "bank deposit"} · {niceDate(f.moneyLine.date)}
              <div className="text-muted-foreground">
                {f.moneyLine.source === "momo" ? `${f.moneyLine.payerName ?? ""} ${f.moneyLine.payerPhone ?? ""}` : f.moneyLine.moneyRef.slice(5)}
                {f.moneyLine.reference && f.moneyLine.source === "momo" ? ` · “${f.moneyLine.reference}”` : ""}
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">None found</span>
          )}
        </div>
      </div>

      <p className="text-sm leading-relaxed">{f.note}</p>

      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {f.kind === "amount_diff" && f.moneyLine && (
          <Button size="sm" onClick={() => onResolve("fix_amount")}>
            Fix amount to {ghs(f.moneyLine.amountGhs)}
          </Button>
        )}
        {f.kind === "no_money" && f.proposedMatch && (
          <Button size="sm" onClick={() => onResolve("accept_match", { note: "Confirmed banked from the Flags screen" })}>
            Banked — confirm deposit
          </Button>
        )}
        {f.kind === "no_money" && !f.proposedMatch && (
          <Button size="sm" variant="outline" onClick={askAgent}>
            Banked separately…
          </Button>
        )}
        {f.kind === "duplicate" && (
          <Button size="sm" onClick={() => onResolve("void_duplicate")}>
            Void duplicate
          </Button>
        )}
        {f.kind === "no_receipt" && (
          <form onSubmit={addReceipt} className="flex items-center gap-2">
            <Input
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
              placeholder="Receipt #"
              inputMode="numeric"
              className="h-8 w-28"
              aria-label="Receipt number to write"
            />
            <Button size="sm" type="submit" disabled={!receiptNo.trim()}>
              Add receipt{f.likelyStudent ? ` for ${f.likelyStudent.name.split(" ")[0]}` : ""}
            </Button>
          </form>
        )}
        <Button size="sm" variant="ghost" onClick={() => onResolve("real_problem")}>
          Mark as problem
        </Button>
      </div>
    </li>
  );
}
