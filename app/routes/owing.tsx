import { useActionQuery } from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";
import { ghsText } from "@/lib/explain-flag";

export function meta() {
  return [{ title: `Owing - ${APP_TITLE}` }];
}

interface FlaggedReceipt {
  receiptNo: string;
  amountGhs: string;
  mark: string;
}

interface OwingStudent {
  id: string;
  name: string;
  className: string;
  termFeeGhs: string;
  paidGhs: string;
  balanceGhs: string;
  flaggedGhs: string;
  flaggedReceipts: FlaggedReceipt[];
}

interface OwingClass {
  className: string;
  subtotalGhs: string;
  students: OwingStudent[];
}

export default function OwingRoute() {
  useSetPageTitle("Owing");
  const owing = useActionQuery("list-owing", {});
  const school = useActionQuery("get-school-settings", {}).data;
  const classes = (owing.data?.classes ?? []) as OwingClass[];
  const n = owing.data?.studentsOwing ?? 0;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-[860px] flex-col px-5 pb-16 pt-9 sm:px-12">
        <header>
          <p className="text-sm text-muted-foreground">
            {school ? [school.schoolName, school.termLabel].filter(Boolean).join(" · ") : " "}
          </p>
          {owing.isLoading ? (
            <Skeleton className="mt-4 h-14 w-64" />
          ) : (
            <h1 className="mt-3 font-display text-[clamp(40px,5vw,56px)] font-semibold leading-none tracking-[-0.02em]">
              {n === 0 ? "No one still owes" : `${n} still owing`}
            </h1>
          )}
          <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">
            The term fee minus receipts that have been verified. A flagged or unchecked receipt is not counted as paid.
          </p>
        </header>

        {owing.isLoading ? (
          <Skeleton className="mt-10 h-64 w-full" />
        ) : n === 0 ? null : (
          <div className="mt-8">
            {classes.map((group) => (
              <section key={group.className} className="border-t-[1.5px] border-foreground">
                <div className="flex items-baseline justify-between gap-3 pt-4">
                  <h2 className="font-display text-xl font-semibold">{group.className}</h2>
                  <p className="tabular text-sm text-muted-foreground">Subtotal {ghsText(group.subtotalGhs)}</p>
                </div>
                <ul>
                  {group.students.map((student) => (
                    <StudentRow key={student.id} student={student} />
                  ))}
                </ul>
              </section>
            ))}
            <div className="flex items-baseline justify-between gap-4 border-t-[1.5px] border-foreground py-4">
              <span className="font-display text-xl font-semibold">Total</span>
              <span className="tabular font-display text-2xl font-semibold">{ghsText(owing.data?.totalGhs ?? "0.00")}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StudentRow({ student }: { student: OwingStudent }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-rule py-3">
      <button type="button" className="flex w-full items-start justify-between gap-4 text-left" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0">
          <span className="block font-display text-lg leading-tight">{student.name}</span>
          <span className="block text-sm text-muted-foreground">{student.className}</span>
          <span className="tabular mt-1 block text-sm text-muted-foreground">
            Fee {ghsText(student.termFeeGhs)} · Paid {ghsText(student.paidGhs)}
          </span>
          {student.flaggedReceipts.map((item) => (
            <span key={item.receiptNo} className="mt-1 block text-sm font-semibold text-oxblood">
              {item.mark}
            </span>
          ))}
        </span>
        <span className="tabular shrink-0 font-display text-xl">{ghsText(student.balanceGhs)}</span>
      </button>
      {open && <StudentReceipts studentId={student.id} />}
    </li>
  );
}

function StudentReceipts({ studentId }: { studentId: string }) {
  const receipts = useActionQuery("list-receipts", { studentId, limit: 100 });
  if (receipts.isLoading) return <Skeleton className="mt-3 h-16 w-full" />;
  const rows = receipts.data?.receipts ?? [];
  if (!rows.length) return <p className="mt-3 text-sm text-muted-foreground">No receipts for this student.</p>;
  return (
    <ul className="mt-3 flex flex-col gap-2 border-t border-rule pt-3">
      {rows.map((row) => (
        <li key={row.id} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0">
            <span className="tabular font-display italic">№ {row.receiptNo}</span>
            <span className="text-muted-foreground"> · {row.date.split("-").reverse().join("/")} · {row.method === "momo" ? "MoMo" : "Cash"}</span>
          </span>
          <span className="flex shrink-0 items-baseline gap-3">
            <span className="tabular">{ghsText(row.amountGhs)}</span>
            <ReceiptStatus status={row.status} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReceiptStatus({ status }: { status: string }) {
  if (status === "verified") return <span>Backed</span>;
  if (status === "flagged") return <span className="font-semibold text-oxblood">Flagged</span>;
  if (status === "void") return <span className="text-muted-foreground line-through">Void</span>;
  return <span className="text-muted-foreground">Not checked</span>;
}
