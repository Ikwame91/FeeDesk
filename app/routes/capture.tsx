import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import { IconCamera, IconCheck, IconPlus } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

import { Seal } from "@/components/feedesk/Seal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: `Capture - ${APP_TITLE}` }];
}

type Field = "receiptNo" | "date" | "studentId" | "className" | "amountGhs" | "method";
type Edits = Record<string, Partial<Record<Field, string>>>;

/** Shrink a phone photo to at most 1600px on its long side, as JPEG, before it goes to the agent. */
async function photoToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function CaptureRoute() {
  useSetPageTitle("Capture");
  const [params, setParams] = useSearchParams();
  const batchId = params.get("batch") ?? undefined;
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const capture = useActionQuery(
    "get-capture",
    batchId ? { batchId } : {},
    { enabled: !!batchId, refetchInterval: (q) => ((q.state.data as { capture?: { status?: string } } | undefined)?.capture?.status === "reading" ? 2500 : false) },
  );
  const studentsQuery = useActionQuery("list-students", {});
  const students = useMemo(
    () => [...(studentsQuery.data?.students ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [studentsQuery.data],
  );

  const start = useActionMutation("start-capture");
  const save = useActionMutation("save-capture-rows", {
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Couldn't save the rows."),
  });
  const confirm = useActionMutation("confirm-capture", {
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Couldn't add the receipts."),
  });

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const c = capture.data?.capture;
  const rows = c?.rows ?? [];
  const reading = !!batchId && (!c || c.status === "reading");

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoUrl(URL.createObjectURL(file));
    setEdits({});
    setRowErrors({});
    let dataUrl: string;
    try {
      dataUrl = await photoToDataUrl(file);
    } catch {
      toast.error("Couldn't open that photo. Try a JPEG or PNG.");
      return;
    }
    start.mutate(
      {},
      {
        onSuccess: ({ batchId: id }) => {
          setParams({ batch: id }, { replace: true });
          setSentAt(Date.now());
          sendToAgentChat({
            message:
              "Read every receipt row in this photo of our receipt book and put them on the capture screen with save-capture-rows. " +
              "Leave anything you can't read empty and list it in unclear.",
            context: JSON.stringify({ captureBatchId: id }),
            images: [dataUrl],
            submit: true,
            openSidebar: true,
          });
        },
        onError: (e) => toast.error(actionErrorMessage(e) ?? "Couldn't start the capture."),
      },
    );
    if (fileInput.current) fileInput.current.value = "";
  }

  /** Current value of a cell: the bursar's edit, else what was read. */
  const value = (row: (typeof rows)[number], f: Field): string =>
    edits[row.rowId]?.[f] ?? (f === "studentId" ? (row.check.studentId ?? "") : (row[f as Exclude<Field, "studentId">] as string));
  const setCell = (rowId: string, f: Field, v: string) => setEdits((e) => ({ ...e, [rowId]: { ...e[rowId], [f]: v } }));

  /** Save the table as it is now (keeps edits), optionally with one extra empty row. */
  function saveTable(extraRow: boolean, onDone?: (id: string) => void) {
    const current = rows
      .filter((r) => !r.added)
      .map((r) => {
        const st = students.find((s) => s.id === value(r, "studentId"));
        return {
          receiptNo: value(r, "receiptNo"),
          date: value(r, "date"),
          studentName: st?.name ?? r.studentName,
          className: value(r, "className"),
          amountGhs: value(r, "amountGhs"),
          method: value(r, "method"),
        };
      });
    save.mutate(
      { ...(batchId ? { batchId } : {}), rows: [...current, ...(extraRow ? [{}] : [])] },
      {
        onSuccess: ({ batchId: id }) => {
          setEdits({});
          if (!batchId) setParams({ batch: id }, { replace: true });
          onDone?.(id);
        },
      },
    );
  }

  const pending = rows.filter((r) => !r.added);
  const complete = (r: (typeof rows)[number]) =>
    !!value(r, "receiptNo") && !!value(r, "date") && !!value(r, "studentId") && !!value(r, "amountGhs") && ["cash", "momo"].includes(value(r, "method"));
  const toAdd = pending.filter(complete);

  function addReceipts() {
    if (!batchId || toAdd.length === 0) return;
    setRowErrors({});
    confirm.mutate(
      {
        batchId,
        rows: toAdd.map((r) => ({
          rowId: r.rowId,
          receiptNo: value(r, "receiptNo"),
          date: value(r, "date"),
          studentId: value(r, "studentId"),
          className: value(r, "className"),
          amountGhs: value(r, "amountGhs"),
          method: value(r, "method") as "cash" | "momo",
        })),
      },
      {
        onSuccess: (res) => {
          toast.success(res.message);
          setRowErrors(Object.fromEntries(res.failed.map((f) => [f.rowId, f.message])));
          setEdits((e) => Object.fromEntries(Object.entries(e).filter(([id]) => res.failed.some((f) => f.rowId === id))));
        },
      },
    );
  }

  const allAdded = rows.length > 0 && pending.length === 0;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1240px] px-5 pb-16 pt-9 sm:px-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[clamp(36px,4.5vw,52px)] font-semibold leading-none tracking-[-0.02em]">Read a receipt page</h1>
            <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
              Photograph a page of the receipt book. The agent reads every row into the table; you check each one against the photo, then
              add them. Nothing is saved as a receipt until you press Add.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
            <Button onClick={() => fileInput.current?.click()} className="h-11 gap-2 text-[15px]">
              <IconCamera className="size-5" strokeWidth={1.7} /> {photoUrl || batchId ? "Another page" : "Snap a receipt page"}
            </Button>
          </div>
        </header>

        {/* Side by side only when this page itself has room (the agent panel takes space), else photo on top. */}
        <div className="@container mt-8 border-t-[1.5px] border-foreground pt-6">
        <div className="grid gap-8 @[68rem]:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
          {/* The photo */}
          <section aria-label="Photo" className="@[68rem]:sticky @[68rem]:top-4 @[68rem]:self-start">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt="The receipt-book page being read"
                className="max-h-[420px] w-full rounded-sm border border-rule bg-card object-contain shadow-sm @[68rem]:max-h-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="feedesk-underprint flex min-h-[260px] w-full flex-col items-center justify-center gap-4 rounded-sm border border-dashed border-foreground/40 p-8 text-center @[68rem]:aspect-[3/4]"
              >
                <IconCamera className="size-10 text-oxblood" strokeWidth={1.3} />
                <span className="font-display text-2xl">{batchId ? "The photo stays only in the tab it was taken in" : "Take or choose a photo"}</span>
                <span className="max-w-xs text-sm text-muted-foreground">
                  Lay the page flat in good light, whole page in frame. A sideways or two-page photo is fine.
                </span>
              </button>
            )}
          </section>

          {/* The rows */}
          <section aria-label="Rows read from the photo" className="min-w-0">
            {!batchId ? (
              <div className="flex flex-col gap-3">
                <h2 className="font-display text-2xl font-semibold">Rows will appear here</h2>
                <p className="text-[15px] text-muted-foreground">
                  No AI credits? Type the rows instead. They go through the same checks.
                </p>
                <div>
                  <Button variant="outline" className="border-foreground" onClick={() => saveTable(true)} disabled={save.isPending}>
                    <IconPlus className="size-4" /> Type the rows
                  </Button>
                </div>
              </div>
            ) : reading ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <Seal label="reading" className="feedesk-reading w-20" />
                  <div>
                    <h2 className="font-display text-2xl font-semibold">The agent is reading the page…</h2>
                    <p className="text-sm text-muted-foreground">
                      Follow along in the chat panel.{sentAt ? " The rows appear here as soon as it saves them." : ""}
                    </p>
                  </div>
                </div>
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="font-display text-2xl font-semibold">
                    {allAdded ? "All added" : `${pending.length} row${pending.length === 1 ? "" : "s"} to check`}
                  </h2>
                  {!allAdded && (
                    <p className="text-sm text-muted-foreground">
                      {pending.filter((r) => r.check.ready).length} look right · {pending.filter((r) => !r.check.ready).length}{" "}
                      {pending.filter((r) => !r.check.ready).length === 1 ? "needs" : "need"} a look
                    </p>
                  )}
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-b border-foreground/70">
                        <th className="py-2 pr-2 font-medium">№</th>
                        <th className="py-2 pr-2 font-medium">Date</th>
                        <th className="py-2 pr-2 font-medium">Student</th>
                        <th className="py-2 pr-2 font-medium">Class</th>
                        <th className="py-2 pr-2 text-right font-medium">GHS</th>
                        <th className="py-2 font-medium">Paid by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const unclear = new Set(r.unclear);
                        const cell = (f: Field) =>
                          cn(
                            "h-8 w-full rounded-[var(--radius)] border bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                            unclear.has(f === "studentId" ? "studentName" : f) && !edits[r.rowId]?.[f]
                              ? "border-oxblood bg-oxblood/5"
                              : "border-input",
                          );
                        const err = rowErrors[r.rowId];
                        if (r.added) {
                          return (
                            <tr key={r.rowId} className="border-b border-rule text-muted-foreground">
                              <td className="tabular py-2 pr-2 font-display italic">{r.receiptNo}</td>
                              <td className="tabular py-2 pr-2">{r.date}</td>
                              <td className="py-2 pr-2" colSpan={3}>
                                {r.studentName} · GHS {r.amountGhs}
                              </td>
                              <td className="py-2">
                                <span className="inline-flex items-center gap-1 text-foreground">
                                  <IconCheck className="size-3.5" strokeWidth={2} /> Added
                                </span>
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={r.rowId} className="border-b border-rule align-top">
                            <td className="w-24 py-2 pr-2">
                              <input aria-label="Receipt number" className={cn(cell("receiptNo"), "tabular")} value={value(r, "receiptNo")} placeholder={unclear.has("receiptNo") ? "unclear" : ""} onChange={(e) => setCell(r.rowId, "receiptNo", e.target.value)} />
                            </td>
                            <td className="w-36 py-2 pr-2">
                              <input aria-label="Date" type="date" className={cn(cell("date"), "tabular")} value={value(r, "date")} onChange={(e) => setCell(r.rowId, "date", e.target.value)} />
                            </td>
                            <td className="py-2 pr-2">
                              <select aria-label="Student" className={cell("studentId")} value={value(r, "studentId")} onChange={(e) => setCell(r.rowId, "studentId", e.target.value)}>
                                <option value="">{r.studentName ? `"${r.studentName}"? choose…` : "Choose…"}</option>
                                {students.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name} · {s.className}
                                  </option>
                                ))}
                              </select>
                              <RowNotes problems={err ? [err] : r.check.problems} warnings={err ? [] : r.check.warnings} />
                            </td>
                            <td className="w-24 py-2 pr-2">
                              <input aria-label="Class" className={cell("className")} value={value(r, "className")} placeholder={unclear.has("className") ? "unclear" : ""} onChange={(e) => setCell(r.rowId, "className", e.target.value)} />
                            </td>
                            <td className="w-28 py-2 pr-2">
                              <input aria-label="Amount in GHS" inputMode="decimal" className={cn(cell("amountGhs"), "tabular text-right")} value={value(r, "amountGhs")} placeholder={unclear.has("amountGhs") ? "unclear" : ""} onChange={(e) => setCell(r.rowId, "amountGhs", e.target.value)} />
                            </td>
                            <td className="w-24 py-2">
                              <select aria-label="Paid by" className={cell("method")} value={value(r, "method")} onChange={(e) => setCell(r.rowId, "method", e.target.value)}>
                                <option value="">—</option>
                                <option value="cash">Cash</option>
                                <option value="momo">MoMo</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-4">
                  {allAdded ? (
                    <>
                      <Seal label="added" stamp className="w-20" />
                      <p className="text-[15px]">
                        Every row is in. <Link to="/dashboard" className="font-semibold text-oxblood hover:underline">Check them against the money →</Link>
                      </p>
                    </>
                  ) : (
                    <>
                      <Button onClick={addReceipts} disabled={toAdd.length === 0 || confirm.isPending} className="h-11 text-[15px]">
                        {confirm.isPending ? "Adding…" : `Add ${toAdd.length} receipt${toAdd.length === 1 ? "" : "s"}`}
                      </Button>
                      <button type="button" onClick={() => saveTable(true)} className="inline-flex items-center gap-1 text-sm font-semibold hover:underline" disabled={save.isPending}>
                        <IconPlus className="size-4" /> Add a row
                      </button>
                      {toAdd.length < pending.length && (
                        <span className="text-sm text-muted-foreground">Rows with an empty field are left until you fill them.</span>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
        </div>
      </div>
    </div>
  );
}

function RowNotes({ problems, warnings }: { problems: string[]; warnings: string[] }) {
  if (!problems.length && !warnings.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs">
      {problems.map((p) => (
        <li key={p} className="text-oxblood">
          {p}
        </li>
      ))}
      {warnings.map((w) => (
        <li key={w} className="text-muted-foreground">
          {w}
        </li>
      ))}
    </ul>
  );
}
