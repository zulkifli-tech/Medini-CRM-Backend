import { useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useBranch } from "@/hooks/useBranch";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, StatusBadge, Panel, EmptyState, StatCard } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { rm, fmtDate, fmtDateTime } from "@/lib/format";
import { Plus, Receipt, Banknote, ShieldCheck, Wallet, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Invoice detail drawer — items, payment timeline, split payment recording
// ---------------------------------------------------------------------------
function InvoiceDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const detail = trpc.finance.invoiceDetail.useQuery({ id: id! }, { enabled: !!id });
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payKind, setPayKind] = useState("partial");

  const record = trpc.finance.recordPayment.useMutation({
    onSuccess: async () => {
      toast.success("Payment recorded");
      setPayAmount("");
      await utils.finance.invalidate();
      await utils.dashboard.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const d = detail.data;
  const paid = d ? d.payments.reduce((s: number, p: any) => s + (p.payment.kind === "refund" ? -1 : 1) * Number(p.payment.amount), 0) : 0;
  const balance = d ? Number(d.invoice.total) - paid : 0;

  return (
    <Sheet open={!!id} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {detail.isLoading ? <Skeleton className="h-96 w-full" /> : d && (
          <div className="space-y-5">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                {d.invoice.number} <StatusBadge status={d.invoice.status} />
              </SheetTitle>
              <p className="text-sm text-slate-500">{d.patientName} · {d.patientPhone} · {(d.branchName ?? "").replace("Medini Dental ", "")}</p>
            </SheetHeader>

            <div className="grid grid-cols-3 gap-3">
              {[
                { l: "Total", v: rm(d.invoice.total), c: "text-slate-900" },
                { l: "Paid", v: rm(paid), c: "text-emerald-600" },
                { l: "Balance", v: rm(Math.max(0, balance)), c: balance > 0 ? "text-amber-600" : "text-emerald-600" },
              ].map((x) => (
                <div key={x.l} className="rounded-xl bg-slate-50 p-3 text-center">
                  <p className="text-[11px] text-slate-400 uppercase font-medium">{x.l}</p>
                  <p className={`text-lg font-bold ${x.c}`}>{x.v}</p>
                </div>
              ))}
            </div>

            {/* Split progress */}
            <div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, (paid / Number(d.invoice.total)) * 100)}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-1">{Math.round((paid / Number(d.invoice.total)) * 100)}% collected{Number(d.invoice.insuranceAmount) > 0 ? ` · Insurance covers ${rm(d.invoice.insuranceAmount)}` : ""}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-800 mb-2">Items</p>
              <div className="rounded-xl border divide-y">
                {d.items.map((it: any) => (
                  <div key={it.id} className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-slate-700">{it.description} × {it.qty}</span>
                    <span className="font-medium">{rm(it.total)}</span>
                  </div>
                ))}
              </div>
            </div>

            {d.claims.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-800 mb-2">Insurance Claims</p>
                {d.claims.map((c: any) => (
                  <div key={c.claim.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm mb-1.5">
                    <span className="text-slate-700">{c.panelName} · {c.claim.claimNo}</span>
                    <div className="flex items-center gap-2"><span className="font-medium">{rm(c.claim.amount)}</span><StatusBadge status={c.claim.status} /></div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <p className="text-sm font-semibold text-slate-800 mb-2">Payment Timeline</p>
              <div className="space-y-1.5">
                {d.payments.map((p: any) => (
                  <div key={p.payment.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium capitalize text-slate-700">{p.payment.kind} · {p.payment.method.replace("_", " ")}</p>
                      <p className="text-xs text-slate-400">{fmtDateTime(p.payment.paidAt)} · {p.payment.reference}{p.receivedBy ? ` · by ${p.receivedBy}` : ""}</p>
                    </div>
                    <span className={`text-sm font-bold ${p.payment.kind === "refund" ? "text-red-600" : "text-emerald-600"}`}>
                      {p.payment.kind === "refund" ? "-" : "+"}{rm(p.payment.amount)}
                    </span>
                  </div>
                ))}
                {!d.payments.length && <p className="text-sm text-slate-400">No payments recorded yet.</p>}
              </div>
            </div>

            {balance > 0.01 && (
              <>
                <Separator />
                <form className="space-y-3" onSubmit={(e) => {
                  e.preventDefault();
                  const amt = Number(payAmount);
                  if (!amt || amt <= 0) return toast.error("Enter a valid amount");
                  record.mutate({ invoiceId: d.invoice.id, amount: amt, method: payMethod as any, kind: payKind as any });
                }}>
                  <p className="text-sm font-semibold text-slate-800">Record Payment</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Amount (RM)</Label><Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={balance.toFixed(2)} /></div>
                    <div className="space-y-1">
                      <Label className="text-xs">Method</Label>
                      <Select value={payMethod} onValueChange={setPayMethod}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["cash", "card", "ewallet", "bank_transfer", "insurance", "deposit"].map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select value={payKind} onValueChange={setPayKind}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["full", "partial", "installment", "deposit", "insurance", "refund"].map((k) => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => { setPayAmount(balance.toFixed(2)); setPayKind("full"); }}>Full balance</Button>
                    <Button className="bg-emerald-600 hover:bg-emerald-700" size="sm" disabled={record.isPending}>Record Payment</Button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// New invoice dialog
// ---------------------------------------------------------------------------
function NewInvoiceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { branchId } = useBranch();
  const utils = trpc.useUtils();
  const branches = trpc.meta.branches.useQuery();
  const treatments = trpc.meta.treatments.useQuery();
  const [q, setQ] = useState("");
  const [patientId, setPatientId] = useState<number | null>(null);
  const [branch, setBranch] = useState("");
  const [items, setItems] = useState<Array<{ treatmentId: string; qty: number }>>([{ treatmentId: "", qty: 1 }]);
  const [insuranceAmount, setInsuranceAmount] = useState("0");
  const res = trpc.patients.list.useQuery({ search: q || undefined, pageSize: 8 }, { enabled: q.length >= 2 && !patientId });
  const effectiveBranch = user?.role === "hq" ? Number(branch || branchId || 0) : user?.branchId!;

  const create = trpc.finance.createInvoice.useMutation({
    onSuccess: async (r) => { toast.success(`Invoice ${r.number} created`); await utils.finance.invoices.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New Invoice</DialogTitle><DialogDescription>Bill a patient for treatments. Insurance split supported.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          if (!patientId) return toast.error("Select a patient");
          if (!effectiveBranch) return toast.error("Select a branch");
          const resolved = items.filter((i) => i.treatmentId).map((i) => {
            const t = (treatments.data ?? []).find((x: any) => String(x.id) === i.treatmentId);
            return { treatmentId: Number(i.treatmentId), description: t?.name ?? "Treatment", qty: i.qty, unitPrice: Number(t?.price ?? 0) };
          });
          if (!resolved.length) return toast.error("Add at least one item");
          create.mutate({ branchId: effectiveBranch, patientId, items: resolved, insuranceAmount: Number(insuranceAmount) || 0 });
        }}>
          {user?.role === "hq" && (
            <div className="space-y-1.5">
              <Label>Branch *</Label>
              <Select value={branch || (branchId ? String(branchId) : "")} onValueChange={setBranch}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{(branches.data ?? []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5 relative">
            <Label>Patient *</Label>
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPatientId(null); }} placeholder="Search patient…" />
            {q.length >= 2 && !patientId && (
              <div className="absolute z-50 top-full mt-1 w-full rounded-lg border bg-white shadow-lg max-h-48 overflow-y-auto">
                {(res.data?.rows ?? []).map((r: any) => (
                  <button key={r.patient.id} type="button" className="w-full px-3 py-2 text-left hover:bg-emerald-50 text-sm"
                    onClick={() => { setPatientId(r.patient.id); setQ(r.patient.name); }}>
                    {r.patient.name} <span className="text-xs text-slate-400">{r.patient.mrn}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Items</Label>
            {items.map((it, idx) => (
              <div key={idx} className="flex gap-2">
                <select className="flex-1 rounded-md border border-input bg-white px-3 py-2 text-sm" value={it.treatmentId}
                  onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, treatmentId: e.target.value } : x))}>
                  <option value="">Select treatment…</option>
                  {(treatments.data ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.name} — RM{Number(t.price).toLocaleString()}</option>)}
                </select>
                <Input className="w-20" type="number" min={1} value={it.qty} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value) } : x))} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { treatmentId: "", qty: 1 }])}><Plus className="h-4 w-4 mr-1" /> Add item</Button>
          </div>
          <div className="space-y-1.5">
            <Label>Insurance Covered Amount (RM)</Label>
            <Input type="number" step="0.01" value={insuranceAmount} onChange={(e) => setInsuranceAmount(e.target.value)} />
            <p className="text-xs text-slate-400">The remainder is billed to the patient (insurance + patient split).</p>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={create.isPending}>Create Invoice</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
export default function Finance() {
  const { branchId } = useBranch();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [invoiceId, setInvoiceId] = useState<number | null>(params.get("invoice") ? Number(params.get("invoice")) : null);
  const [showNew, setShowNew] = useState(false);

  const invoices = trpc.finance.invoices.useQuery({ branchId, status: statusFilter === "all" ? undefined : statusFilter, page, pageSize: 15 });
  const outstanding = trpc.finance.outstanding.useQuery({ branchId });
  const closing = trpc.finance.dailyClosing.useQuery({ branchId });
  const claims = trpc.finance.claims.useQuery({ branchId });
  const utils = trpc.useUtils();
  const updateClaim = trpc.finance.updateClaimStatus.useMutation({
    onSuccess: async () => { toast.success("Claim updated"); await utils.finance.claims.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const canApprove = ["hq", "branch_manager"].includes(user?.role ?? "");
  const totalPages = Math.max(1, Math.ceil((invoices.data?.total ?? 0) / 15));
  const totalOutstanding = (outstanding.data ?? []).reduce((s: number, r: any) => s + r.balance, 0);

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader
        title="Finance"
        description="Invoices, payments, insurance and daily closing"
        actions={<Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowNew(true)}><Receipt className="h-4 w-4 mr-1.5" /> New Invoice</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Collected Today" value={rm(closing.data?.total ?? 0)} icon={<Banknote className="h-4 w-4" />} loading={closing.isLoading} />
        <StatCard title="Outstanding" value={rm(totalOutstanding, 0)} icon={<Wallet className="h-4 w-4" />} sub={`${outstanding.data?.length ?? 0} open invoices`} loading={outstanding.isLoading} />
        <StatCard title="Invoices" value={invoices.data?.total ?? "…"} icon={<Receipt className="h-4 w-4" />} loading={invoices.isLoading} />
        <StatCard title="Insurance Claims" value={claims.data?.length ?? "…"} icon={<ShieldCheck className="h-4 w-4" />} sub={`${(claims.data ?? []).filter((c: any) => c.claim.status === "submitted").length} awaiting review`} loading={claims.isLoading} />
      </div>

      <Tabs defaultValue="invoices">
        <TabsList className="bg-white border">
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding ({outstanding.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="closing">Daily Closing</TabsTrigger>
          <TabsTrigger value="claims">Insurance Claims</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4 space-y-3">
          <div className="flex gap-1.5">
            {["all", "issued", "partial", "paid", "refunded", "cancelled"].map((s) => (
              <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${statusFilter === s ? "bg-emerald-600 text-white" : "bg-white border text-slate-500"}`}>{s}</button>
            ))}
          </div>
          <div className="rounded-xl border bg-white overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead>Invoice</TableHead><TableHead>Patient</TableHead><TableHead>Branch</TableHead>
                <TableHead>Issued</TableHead><TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {invoices.isLoading
                  ? Array.from({ length: 8 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
                  : (invoices.data?.rows ?? []).map((r: any) => {
                      const bal = Number(r.invoice.total) - r.paidAmount;
                      return (
                        <TableRow key={r.invoice.id} className="cursor-pointer hover:bg-emerald-50/40" onClick={() => setInvoiceId(r.invoice.id)}>
                          <TableCell className="font-mono text-xs font-medium">{r.invoice.number}</TableCell>
                          <TableCell className="text-sm">{r.patientName}</TableCell>
                          <TableCell className="text-xs text-slate-500">{(r.branchName ?? "").replace("Medini Dental ", "")}</TableCell>
                          <TableCell className="text-xs text-slate-500">{fmtDate(r.invoice.issuedAt)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{rm(r.invoice.total)}</TableCell>
                          <TableCell className="text-right text-sm text-emerald-600">{rm(r.paidAmount)}</TableCell>
                          <TableCell className={`text-right text-sm font-medium ${bal > 0 ? "text-amber-600" : "text-slate-300"}`}>{rm(Math.max(0, bal))}</TableCell>
                          <TableCell><StatusBadge status={r.invoice.status} /></TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
            {!invoices.isLoading && !invoices.data?.rows?.length && <EmptyState title="No invoices" />}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /> Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="outstanding" className="mt-4">
          <div className="rounded-xl border bg-white overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead>Invoice</TableHead><TableHead>Patient</TableHead><TableHead>Phone</TableHead>
                <TableHead>Due Date</TableHead><TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(outstanding.data ?? []).map((r: any) => (
                  <TableRow key={r.invoice.id} className="cursor-pointer hover:bg-amber-50/50" onClick={() => setInvoiceId(r.invoice.id)}>
                    <TableCell className="font-mono text-xs font-medium">{r.invoice.number}</TableCell>
                    <TableCell className="text-sm">{r.patientName}</TableCell>
                    <TableCell className="text-xs text-slate-500">{r.patientPhone}</TableCell>
                    <TableCell className="text-xs">
                      <span className={r.invoice.dueAt && new Date(r.invoice.dueAt) < new Date() ? "text-red-600 font-medium" : "text-slate-500"}>{fmtDate(r.invoice.dueAt)}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm">{rm(r.invoice.total)}</TableCell>
                    <TableCell className="text-right text-sm text-emerald-600">{rm(r.paidAmount)}</TableCell>
                    <TableCell className="text-right text-sm font-bold text-amber-600">{rm(r.balance)}</TableCell>
                    <TableCell><StatusBadge status={r.invoice.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!outstanding.data?.length && <EmptyState title="No outstanding balances 🎉" />}
          </div>
        </TabsContent>

        <TabsContent value="closing" className="mt-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Panel title="Today's Collection by Method">
              <div className="space-y-2">
                {(closing.data?.byMethod ?? []).map((m: any) => (
                  <div key={m.method} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
                    <span className="text-sm capitalize text-slate-600">{m.method.replace("_", " ")} <span className="text-xs text-slate-400">({m.count})</span></span>
                    <span className="text-sm font-bold text-slate-800">{rm(m.value)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-lg bg-emerald-600 px-3 py-2.5">
                  <span className="text-sm font-medium text-white">Total</span>
                  <span className="text-sm font-bold text-white">{rm(closing.data?.total ?? 0)}</span>
                </div>
              </div>
            </Panel>
            <Panel title="Today's Transactions" className="lg:col-span-2">
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {(closing.data?.rows ?? []).map((r: any) => (
                  <div key={r.payment.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{r.patientName}</p>
                      <p className="text-xs text-slate-400">{r.invoiceNo} · {fmtDateTime(r.payment.paidAt)} · {r.payment.method.replace("_", " ")}</p>
                    </div>
                    <span className={`text-sm font-bold ${r.payment.kind === "refund" ? "text-red-600" : "text-emerald-600"}`}>{r.payment.kind === "refund" ? "-" : "+"}{rm(r.payment.amount)}</span>
                  </div>
                ))}
                {!closing.data?.rows?.length && <EmptyState title="No transactions today" />}
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="claims" className="mt-4">
          <div className="rounded-xl border bg-white overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead>Claim</TableHead><TableHead>Patient</TableHead><TableHead>Panel</TableHead>
                <TableHead>Invoice</TableHead><TableHead>Submitted</TableHead>
                <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>{canApprove && <TableHead></TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {(claims.data ?? []).map((r: any) => (
                  <TableRow key={r.claim.id}>
                    <TableCell className="font-mono text-xs">{r.claim.claimNo}</TableCell>
                    <TableCell className="text-sm">{r.patientName}</TableCell>
                    <TableCell className="text-sm text-blue-600">{r.panelName}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{r.invoiceNo}</TableCell>
                    <TableCell className="text-xs text-slate-500">{fmtDate(r.claim.submittedAt)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{rm(r.claim.amount)}</TableCell>
                    <TableCell><StatusBadge status={r.claim.status} /></TableCell>
                    {canApprove && (
                      <TableCell>
                        {r.claim.status === "submitted" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateClaim.mutate({ id: r.claim.id, status: "approved" })}>Approve</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => updateClaim.mutate({ id: r.claim.id, status: "rejected" })}>Reject</Button>
                          </div>
                        )}
                        {r.claim.status === "approved" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateClaim.mutate({ id: r.claim.id, status: "paid" })}>Mark Paid</Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!claims.data?.length && <EmptyState title="No insurance claims" />}
          </div>
        </TabsContent>
      </Tabs>

      <InvoiceDrawer id={invoiceId} onClose={() => setInvoiceId(null)} />
      <NewInvoiceDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
