import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useBranch } from "@/hooks/useBranch";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, StatusBadge, Panel, EmptyState } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { rm, fmtDateTime } from "@/lib/format";
import { Stethoscope, ClipboardList, Pill, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

function PatientSearch({ value, onChange }: { value: number | null; onChange: (id: number) => void }) {
  const [q, setQ] = useState("");
  const res = trpc.patients.list.useQuery({ search: q || undefined, pageSize: 8 }, { enabled: q.length >= 2 && !value });
  return (
    <div className="relative">
      <Input value={q} onChange={(e) => { setQ(e.target.value); onChange(0); }} placeholder="Search patient…" />
      {q.length >= 2 && !value && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border bg-white shadow-lg max-h-52 overflow-y-auto">
          {(res.data?.rows ?? []).map((r: any) => (
            <button key={r.patient.id} type="button" className="w-full px-3 py-2 text-left hover:bg-emerald-50 text-sm"
              onClick={() => { onChange(r.patient.id); setQ(r.patient.name); }}>
              <span className="font-medium">{r.patient.name}</span>
              <span className="text-xs text-slate-400 ml-2">{r.patient.mrn}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AddNoteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [patientId, setPatientId] = useState<number | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [procedures, setProcedures] = useState("");
  const add = trpc.clinical.addNote.useMutation({
    onSuccess: async () => { toast.success("Clinical note saved"); await utils.clinical.notes.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Clinical Note</DialogTitle><DialogDescription>Document diagnosis and treatment for this visit.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!patientId) return toast.error("Select a patient"); add.mutate({ patientId, diagnosis, notes, procedures: procedures || undefined }); }}>
          <div className="space-y-1.5"><Label>Patient *</Label><PatientSearch value={patientId} onChange={(id) => setPatientId(id || null)} /></div>
          <div className="space-y-1.5"><Label>Diagnosis *</Label><Input required value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Clinical Notes *</Label><Textarea required value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} /></div>
          <div className="space-y-1.5"><Label>Procedures Performed</Label><Input value={procedures} onChange={(e) => setProcedures(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={add.isPending}>Save Note</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddPlanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const treatments = trpc.meta.treatments.useQuery();
  const [patientId, setPatientId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<Array<{ treatmentId: string; toothNo: string }>>([{ treatmentId: "", toothNo: "" }]);
  const add = trpc.clinical.addPlan.useMutation({
    onSuccess: async () => { toast.success("Treatment plan created"); await utils.clinical.plans.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New Treatment Plan</DialogTitle><DialogDescription>Build a multi-step plan with pricing for the patient.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          if (!patientId) return toast.error("Select a patient");
          const resolved = items.filter((i) => i.treatmentId).map((i) => {
            const t = (treatments.data ?? []).find((x: any) => String(x.id) === i.treatmentId);
            return { treatmentId: Number(i.treatmentId), description: t?.name ?? "Treatment", toothNo: i.toothNo || undefined, qty: 1, price: Number(t?.price ?? 0) };
          });
          if (!resolved.length) return toast.error("Add at least one item");
          add.mutate({ patientId, title, items: resolved });
        }}>
          <div className="space-y-1.5"><Label>Patient *</Label><PatientSearch value={patientId} onChange={(id) => setPatientId(id || null)} /></div>
          <div className="space-y-1.5"><Label>Plan Title *</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Smile makeover plan" /></div>
          <div className="space-y-2">
            <Label>Plan Items</Label>
            {items.map((it, idx) => (
              <div key={idx} className="flex gap-2">
                <select className="flex-1 rounded-md border border-input bg-white px-3 py-2 text-sm" value={it.treatmentId}
                  onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, treatmentId: e.target.value } : x))}>
                  <option value="">Select treatment…</option>
                  {(treatments.data ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.name} — RM{Number(t.price).toLocaleString()}</option>)}
                </select>
                <Input className="w-24" placeholder="Tooth" value={it.toothNo} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, toothNo: e.target.value } : x))} />
                {items.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4 text-slate-400" /></Button>}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { treatmentId: "", toothNo: "" }])}><Plus className="h-4 w-4 mr-1" /> Add item</Button>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={add.isPending}>Create Plan</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddRxDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [patientId, setPatientId] = useState<number | null>(null);
  const [form, setForm] = useState({ medication: "", dosage: "", frequency: "", durationDays: "5", notes: "" });
  const add = trpc.clinical.addPrescription.useMutation({
    onSuccess: async () => { toast.success("Prescription issued"); await utils.clinical.prescriptions.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Prescription</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!patientId) return toast.error("Select a patient"); add.mutate({ patientId, ...form, durationDays: Number(form.durationDays) || undefined, dosage: form.dosage || undefined, frequency: form.frequency || undefined, notes: form.notes || undefined }); }}>
          <div className="space-y-1.5"><Label>Patient *</Label><PatientSearch value={patientId} onChange={(id) => setPatientId(id || null)} /></div>
          <div className="space-y-1.5"><Label>Medication *</Label><Input required value={form.medication} onChange={(e) => setForm({ ...form, medication: e.target.value })} placeholder="e.g. Amoxicillin 500mg" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Dosage</Label><Input value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Frequency</Label><Input value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Days</Label><Input type="number" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={add.isPending}>Issue Rx</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Clinical() {
  const { branchId } = useBranch();
  const { user } = useAuth();
  const isDoctor = user?.role === "doctor";
  const notes = trpc.clinical.notes.useQuery({ branchId });
  const plans = trpc.clinical.plans.useQuery({ branchId });
  const rx = trpc.clinical.prescriptions.useQuery({ branchId });
  const [dialog, setDialog] = useState<null | "note" | "plan" | "rx">(null);

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader
        title="Clinical"
        description="Clinical notes, treatment plans and prescriptions"
        actions={isDoctor && (
          <>
            <Button variant="outline" size="sm" onClick={() => setDialog("rx")}><Pill className="h-4 w-4 mr-1.5" /> Prescription</Button>
            <Button variant="outline" size="sm" onClick={() => setDialog("plan")}><ClipboardList className="h-4 w-4 mr-1.5" /> Treatment Plan</Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialog("note")}><Stethoscope className="h-4 w-4 mr-1.5" /> New Note</Button>
          </>
        )}
      />

      <Tabs defaultValue="notes">
        <TabsList className="bg-white border">
          <TabsTrigger value="notes">Clinical Notes</TabsTrigger>
          <TabsTrigger value="plans">Treatment Plans</TabsTrigger>
          <TabsTrigger value="rx">Prescriptions</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="mt-4">
          {notes.isLoading ? <Skeleton className="h-64 w-full" /> : (
            <div className="space-y-3">
              {(notes.data ?? []).map((n: any) => (
                <Panel key={n.note.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link to={`/patients/${n.note.patientId}`} className="font-semibold text-slate-800 hover:text-emerald-600">{n.patientName}</Link>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-sm text-slate-500">{n.note.diagnosis}</span>
                      </div>
                      <p className="text-sm text-slate-600 mt-1.5">{n.note.notes}</p>
                      {n.note.procedures && <p className="text-xs text-emerald-600 mt-2 font-medium">Procedures: {n.note.procedures}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-400">{fmtDateTime(n.note.createdAt)}</p>
                      <p className="text-xs font-medium text-slate-500 mt-1">{n.doctorName}</p>
                      {user?.role === "hq" && <p className="text-xs text-slate-400">{(n.branchName ?? "").replace("Medini Dental ", "")}</p>}
                    </div>
                  </div>
                </Panel>
              ))}
              {!notes.data?.length && <Panel><EmptyState title="No clinical notes yet" /></Panel>}
            </div>
          )}
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          {plans.isLoading ? <Skeleton className="h-64 w-full" /> : (
            <div className="grid lg:grid-cols-2 gap-4">
              {(plans.data?.plans ?? []).map((p: any) => {
                const items = (plans.data?.items ?? []).filter((it: any) => it.planId === p.plan.id);
                const total = items.reduce((s: number, it: any) => s + Number(it.price) * it.qty, 0);
                return (
                  <Panel key={p.plan.id} title={p.plan.title} subtitle={`${p.patientName} · ${p.doctorName} · ${fmtDateTime(p.plan.createdAt)}`} action={<StatusBadge status={p.plan.status} />}>
                    <div className="space-y-1.5">
                      {items.map((it: any) => (
                        <div key={it.id} className="flex items-center justify-between text-sm rounded-lg bg-slate-50 px-3 py-1.5">
                          <span className="text-slate-700">{it.description}{it.toothNo ? ` · T${it.toothNo}` : ""}</span>
                          <span className="font-medium">{rm(it.price)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 border-t mt-2">
                        <span className="text-xs text-slate-400">{items.filter((i: any) => i.status === "done").length}/{items.length} completed</span>
                        <span className="text-sm font-bold text-slate-900">{rm(total)}</span>
                      </div>
                    </div>
                  </Panel>
                );
              })}
              {!plans.data?.plans?.length && <Panel className="lg:col-span-2"><EmptyState title="No treatment plans" /></Panel>}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rx" className="mt-4">
          {rx.isLoading ? <Skeleton className="h-64 w-full" /> : (
            <Panel>
              <div className="divide-y divide-slate-100">
                {(rx.data ?? []).map((r: any) => (
                  <div key={r.rx.id} className="py-3 flex items-center gap-4">
                    <div className="rounded-lg bg-violet-50 p-2"><Pill className="h-4 w-4 text-violet-600" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{r.rx.medication} <span className="font-normal text-slate-400">{r.rx.dosage}</span></p>
                      <p className="text-xs text-slate-400">{r.rx.frequency}{r.rx.durationDays ? ` · ${r.rx.durationDays} days` : ""}</p>
                    </div>
                    <div className="text-right">
                      <Link to={`/patients/${r.rx.patientId}`} className="text-sm text-emerald-600 hover:underline">{r.patientName}</Link>
                      <p className="text-xs text-slate-400">{r.doctorName} · {fmtDateTime(r.rx.createdAt)}</p>
                    </div>
                  </div>
                ))}
                {!rx.data?.length && <EmptyState title="No prescriptions" />}
              </div>
            </Panel>
          )}
        </TabsContent>
      </Tabs>

      <AddNoteDialog open={dialog === "note"} onClose={() => setDialog(null)} />
      <AddPlanDialog open={dialog === "plan"} onClose={() => setDialog(null)} />
      <AddRxDialog open={dialog === "rx"} onClose={() => setDialog(null)} />
    </div>
  );
}
