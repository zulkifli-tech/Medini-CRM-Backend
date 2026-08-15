import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useBranch } from "@/hooks/useBranch";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fmtDate, age, initials } from "@/lib/format";
import { UserPlus, Search, ChevronLeft, ChevronRight, BellRing } from "lucide-react";
import { toast } from "sonner";

function NewPatientDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const { user } = useAuth();
  const { branchId } = useBranch();
  const branches = trpc.meta.branches.useQuery();
  const panels = trpc.meta.insurancePanels.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ name: "", phone: "", email: "", icNumber: "", dob: "", gender: "female", allergies: "", source: "walkin", insurancePanelId: "", insurancePolicyNo: "" });
  const [branch, setBranch] = useState<string>("");

  const create = trpc.patients.create.useMutation({
    onSuccess: async (r) => {
      toast.success(`Patient registered — MRN ${r.mrn}`);
      await utils.patients.list.invalidate();
      onCreated(r.id);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const effectiveBranch = user?.role === "hq" ? (branch ? Number(branch) : branchId) : user?.branchId;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register New Patient</DialogTitle>
          <DialogDescription>Add a patient to the system. Required: name and phone.</DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!effectiveBranch) return toast.error("Please select a branch");
            create.mutate({
              branchId: effectiveBranch,
              name: form.name, phone: form.phone,
              email: form.email || undefined, icNumber: form.icNumber || undefined,
              dob: form.dob || undefined, gender: form.gender as any,
              allergies: form.allergies || undefined, source: form.source as any,
              insurancePanelId: form.insurancePanelId ? Number(form.insurancePanelId) : undefined,
              insurancePolicyNo: form.insurancePolicyNo || undefined,
            });
          }}
        >
          {user?.role === "hq" && (
            <div className="col-span-2 space-y-1.5">
              <Label>Branch *</Label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{(branches.data ?? []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2 space-y-1.5"><Label>Full Name *</Label><Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Phone *</Label><Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+6012-345 6789" /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>IC Number</Label><Input value={form.icNumber} onChange={(e) => setForm({ ...form, icNumber: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="female">Female</SelectItem><SelectItem value="male">Male</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="walkin">Walk-in</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="referral">Referral</SelectItem><SelectItem value="campaign">Campaign</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5"><Label>Allergies</Label><Input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="e.g. Penicillin" /></div>
          <div className="space-y-1.5">
            <Label>Insurance Panel</Label>
            <Select value={form.insurancePanelId} onValueChange={(v) => setForm({ ...form, insurancePanelId: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(panels.data ?? []).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Policy No.</Label><Input value={form.insurancePolicyNo} onChange={(e) => setForm({ ...form, insurancePolicyNo: e.target.value })} /></div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Register Patient"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Patients() {
  const { branchId } = useBranch();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [recallOnly, setRecallOnly] = useState(false);
  const [showNew, setShowNew] = useState(params.get("new") === "1");

  const list = trpc.patients.list.useQuery({ branchId, search: search || undefined, page, pageSize: 15, recallOnly });
  const canCreate = ["hq", "branch_manager", "branch_admin"].includes(user?.role ?? "");
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 15));

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader
        title={user?.role === "doctor" ? "Patient 360" : "Patients"}
        description={`${list.data?.total?.toLocaleString() ?? "…"} patients ${recallOnly ? "due for recall" : "in scope"}`}
        actions={
          <>
            <Button variant={recallOnly ? "default" : "outline"} size="sm" onClick={() => { setRecallOnly(!recallOnly); setPage(1); }} className={recallOnly ? "bg-amber-500 hover:bg-amber-600" : ""}>
              <BellRing className="h-4 w-4 mr-1.5" /> Recall Due
            </Button>
            {canCreate && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowNew(true)}>
                <UserPlus className="h-4 w-4 mr-1.5" /> New Patient
              </Button>
            )}
          </>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, phone, MRN…" className="pl-9 bg-white" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Patient</TableHead>
              <TableHead>MRN</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Age / Gender</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Insurance</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Last Visit</TableHead>
              <TableHead>Recall</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              : (list.data?.rows ?? []).map((r: any) => (
                  <TableRow key={r.patient.id} className="hover:bg-emerald-50/40 cursor-pointer">
                    <TableCell>
                      <Link to={`/patients/${r.patient.id}`} className="flex items-center gap-2.5 group">
                        <Avatar className="h-8 w-8"><AvatarFallback className="bg-emerald-100 text-emerald-700 text-[10px]">{initials(r.patient.name)}</AvatarFallback></Avatar>
                        <span className="font-medium text-slate-800 group-hover:text-emerald-700">{r.patient.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{r.patient.mrn}</TableCell>
                    <TableCell className="text-xs text-slate-500">{r.patient.phone}</TableCell>
                    <TableCell className="text-xs text-slate-500">{age(r.patient.dob)} · {r.patient.gender === "male" ? "M" : "F"}</TableCell>
                    <TableCell className="text-xs text-slate-500">{(r.branchName ?? "").replace("Medini Dental ", "")}</TableCell>
                    <TableCell className="text-xs">{r.panelName ? <span className="text-blue-600">{r.panelName}</span> : <span className="text-slate-300">—</span>}</TableCell>
                    <TableCell><span className="text-xs capitalize text-slate-500">{r.patient.source}</span></TableCell>
                    <TableCell className="text-xs text-slate-500">{fmtDate(r.patient.lastVisitAt)}</TableCell>
                    <TableCell>
                      {r.patient.nextRecallAt && new Date(r.patient.nextRecallAt) < new Date(Date.now() + 14 * 86400000)
                        ? <StatusBadge status="pending" />
                        : <span className="text-xs text-slate-300">{fmtDate(r.patient.nextRecallAt)}</span>}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
        {!list.isLoading && !list.data?.rows?.length && <EmptyState title="No patients found" description="Try a different search or register a new patient." />}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /> Prev</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <NewPatientDialog open={showNew} onClose={() => { setShowNew(false); setParams({}); }} onCreated={() => {}} />
    </div>
  );
}
