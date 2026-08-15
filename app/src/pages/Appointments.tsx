import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useBranch } from "@/hooks/useBranch";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, StatusBadge, Panel, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtTime, fmtDate } from "@/lib/format";
import { CalendarPlus, Bot, Footprints, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { toast } from "sonner";

const statusFlow: Record<string, string[]> = {
  booked: ["confirmed", "cancelled", "no_show"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [], cancelled: [], no_show: [],
};

function PatientPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState("");
  const res = trpc.patients.list.useQuery({ search: q || undefined, pageSize: 8 }, { enabled: q.length >= 2 });
  const selected = trpc.patients.get360.useQuery({ id: Number(value) }, { enabled: !!value });
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
        <span className="text-sm font-medium text-emerald-800">{selected.data?.patient?.name ?? `Patient #${value}`}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>Change</Button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type patient name or phone…" />
      {q.length >= 2 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border bg-white shadow-lg max-h-52 overflow-y-auto">
          {(res.data?.rows ?? []).map((r: any) => (
            <button key={r.patient.id} type="button" className="w-full px-3 py-2 text-left hover:bg-emerald-50 text-sm"
              onClick={() => { onChange(String(r.patient.id)); setQ(""); }}>
              <span className="font-medium">{r.patient.name}</span>
              <span className="text-xs text-slate-400 ml-2">{r.patient.mrn} · {r.patient.phone}</span>
            </button>
          ))}
          {!res.data?.rows?.length && <p className="px-3 py-3 text-sm text-slate-400">No match — register the patient first.</p>}
        </div>
      )}
    </div>
  );
}

function BookingDialog({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: "manual" | "ai" | "walkin" }) {
  const { user } = useAuth();
  const { branchId } = useBranch();
  const utils = trpc.useUtils();
  const branches = trpc.meta.branches.useQuery();
  const [branch, setBranch] = useState("");
  const effectiveBranch = user?.role === "hq" ? Number(branch || branchId || 0) : user?.branchId!;
  const doctors = trpc.meta.doctors.useQuery({ branchId: effectiveBranch || undefined }, { enabled: !!effectiveBranch });
  const treatments = trpc.meta.treatments.useQuery();
  const chairs = trpc.meta.chairs.useQuery({ branchId: effectiveBranch }, { enabled: !!effectiveBranch && mode !== "ai" });

  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const [chairId, setChairId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");
  const [dayOffset, setDayOffset] = useState("1");
  const [timePref, setTimePref] = useState("morning");
  const [notes, setNotes] = useState("");

  const invalidate = async () => {
    await utils.appointments.list.invalidate();
    await utils.appointments.todayQueue.invalidate();
    await utils.dashboard.stats.invalidate();
  };

  const create = trpc.appointments.create.useMutation({
    onSuccess: async () => { toast.success(mode === "walkin" ? "Walk-in checked in" : "Appointment booked"); await invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const aiBook = trpc.appointments.aiBook.useMutation({
    onSuccess: async (r) => {
      toast.success(
        <div>
          <p className="font-semibold">AI Booking Manager confirmed ✅</p>
          <p className="text-xs mt-1">{fmtDate(r.startAt)} · {fmtTime(r.startAt)}<br />{r.doctorName} · {r.treatmentName}</p>
        </div>, { duration: 6000 },
      );
      await invalidate(); onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const titles = { manual: "Book Appointment", ai: "AI Booking Manager", walkin: "Walk-in Registration" };
  const descs = {
    manual: "Pick an exact slot for this patient.",
    ai: "Tell the AI what the patient needs — it finds the best doctor, chair and slot automatically.",
    walkin: "Register an immediate walk-in visit (checked in now).",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "ai" && <Sparkles className="h-5 w-5 text-emerald-500" />}
            {titles[mode]}
          </DialogTitle>
          <DialogDescription>{descs[mode]}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!patientId) return toast.error("Select a patient");
            if (!effectiveBranch) return toast.error("Select a branch");
            if (mode === "ai") {
              aiBook.mutate({
                branchId: effectiveBranch, patientId: Number(patientId),
                treatmentId: treatmentId ? Number(treatmentId) : undefined,
                preferredDayOffset: Number(dayOffset), preferredTime: timePref as any,
              });
            } else {
              if (!doctorId) return toast.error("Select a doctor");
              const start = mode === "walkin" ? new Date() : new Date(`${date}T${time}:00`);
              const t = (treatments.data ?? []).find((x: any) => String(x.id) === treatmentId);
              create.mutate({
                branchId: effectiveBranch, patientId: Number(patientId), doctorId: Number(doctorId),
                chairId: chairId ? Number(chairId) : undefined, treatmentId: treatmentId ? Number(treatmentId) : undefined,
                startAt: start, durationMin: t?.durationMin ?? 30, notes: notes || undefined, source: mode,
              });
            }
          }}
        >
          {user?.role === "hq" && (
            <div className="space-y-1.5">
              <Label>Branch *</Label>
              <Select value={branch || (branchId ? String(branchId) : "")} onValueChange={setBranch}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{(branches.data ?? []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label>Patient *</Label><PatientPicker value={patientId} onChange={setPatientId} /></div>
          <div className="space-y-1.5">
            <Label>Treatment</Label>
            <Select value={treatmentId} onValueChange={setTreatmentId}>
              <SelectTrigger><SelectValue placeholder="Select treatment" /></SelectTrigger>
              <SelectContent>{(treatments.data ?? []).map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name} — RM{Number(t.price).toLocaleString()}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {mode !== "ai" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Doctor *</Label>
                  <Select value={doctorId} onValueChange={setDoctorId}>
                    <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                    <SelectContent>{(doctors.data ?? []).map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Chair</Label>
                  <Select value={chairId} onValueChange={setChairId}>
                    <SelectTrigger><SelectValue placeholder="Auto" /></SelectTrigger>
                    <SelectContent>{(chairs.data ?? []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {mode !== "walkin" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Time</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Preferred day</Label>
                <Select value={dayOffset} onValueChange={setDayOffset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => <SelectItem key={d} value={String(d)}>{d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Preferred time</Label>
                <Select value={timePref} onValueChange={setTimePref}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning (9am–12pm)</SelectItem>
                    <SelectItem value="afternoon">Afternoon (1pm–4pm)</SelectItem>
                    <SelectItem value="evening">Evening (4pm–8pm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={create.isPending || aiBook.isPending}>
              {create.isPending || aiBook.isPending ? "Working…" : mode === "ai" ? "Let AI Book" : mode === "walkin" ? "Check In Now" : "Book Appointment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Appointments() {
  const { branchId } = useBranch();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [dialog, setDialog] = useState<null | "manual" | "ai" | "walkin">(params.get("walkin") === "1" ? "walkin" : null);
  const [statusFilter, setStatusFilter] = useState("all");
  const utils = trpc.useUtils();

  const from = useMemo(() => { const d = new Date(day); d.setHours(0, 0, 0, 0); return d; }, [day]);
  const to = useMemo(() => { const d = new Date(day); d.setHours(23, 59, 59, 999); return d; }, [day]);

  const list = trpc.appointments.list.useQuery(
    { branchId, from, to, status: statusFilter === "all" ? undefined : statusFilter },
  );
  const canBook = ["hq", "branch_manager", "branch_admin"].includes(user?.role ?? "");

  const updateStatus = trpc.appointments.updateStatus.useMutation({
    onSuccess: async () => {
      toast.success("Status updated");
      await utils.appointments.list.invalidate();
      await utils.dashboard.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const shiftDay = (n: number) => {
    const d = new Date(day); d.setDate(d.getDate() + n);
    setDay(d.toISOString().slice(0, 10));
  };

  const hours = Array.from({ length: 12 }, (_, i) => i + 9); // 9am–8pm
  const byHour = (h: number) => (list.data ?? []).filter((r: any) => new Date(r.appointment.startAt).getHours() === h);

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader
        title={user?.role === "doctor" ? "Today's Patients" : "Appointments"}
        description="Calendar, queue, walk-ins and AI booking"
        actions={canBook && (
          <>
            <Button variant="outline" size="sm" onClick={() => setDialog("walkin")}><Footprints className="h-4 w-4 mr-1.5" /> Walk-in</Button>
            <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => setDialog("ai")}><Bot className="h-4 w-4 mr-1.5" /> AI Booking</Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialog("manual")}><CalendarPlus className="h-4 w-4 mr-1.5" /> Book</Button>
          </>
        )}
      />

      {/* Day navigation + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border bg-white px-1 py-1">
          <Button variant="ghost" size="sm" onClick={() => shiftDay(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="border-0 w-36 h-8 focus-visible:ring-0" />
          <Button variant="ghost" size="sm" onClick={() => shiftDay(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => setDay(new Date().toISOString().slice(0, 10))}>Today</Button>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["all", "booked", "confirmed", "checked_in", "in_progress", "completed", "cancelled", "no_show"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${statusFilter === s ? "bg-emerald-600 text-white" : "bg-white border text-slate-500 hover:border-emerald-300"}`}>
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline calendar */}
      <Panel title={`Schedule — ${fmtDate(day)}`} subtitle={`${list.data?.length ?? 0} appointments`}>
        {list.isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : (
          <div className="relative">
            {hours.map((h) => {
              const rows = byHour(h);
              return (
                <div key={h} className="grid grid-cols-[70px_1fr] border-b border-slate-100 last:border-0">
                  <div className="py-3 text-xs font-medium text-slate-400 text-right pr-4">{h > 12 ? `${h - 12} PM` : h === 12 ? "12 PM" : `${h} AM`}</div>
                  <div className="py-1.5 space-y-1.5 min-h-[44px]">
                    {rows.map((r: any) => (
                      <div key={r.appointment.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-emerald-300 hover:shadow-sm transition group">
                        <span className="text-xs font-bold text-slate-500 w-14">{fmtTime(r.appointment.startAt)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{r.patientName}</p>
                          <p className="text-xs text-slate-400 truncate">
                            {r.treatmentName ?? "General"} · {r.doctorName} · {r.chairName ?? "—"}
                            {user?.role === "hq" && r.branchName ? ` · ${r.branchName.replace("Medini Dental ", "")}` : ""}
                          </p>
                        </div>
                        {r.appointment.source === "ai" && <span title="Booked by AI"><Bot className="h-3.5 w-3.5 text-emerald-500" /></span>}
                        {r.appointment.source === "walkin" && <span title="Walk-in"><Footprints className="h-3.5 w-3.5 text-amber-500" /></span>}
                        <StatusBadge status={r.appointment.status} />
                        {(canBook || user?.role === "doctor") && statusFlow[r.appointment.status]?.length > 0 && (
                          <div className="hidden group-hover:flex gap-1">
                            {statusFlow[r.appointment.status].map((next) => (
                              <Button key={next} size="sm" variant="outline" className="h-7 text-xs capitalize"
                                onClick={() => updateStatus.mutate({ id: r.appointment.id, status: next as any })}>
                                {next.replace(/_/g, " ")}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {!list.data?.length && <EmptyState title="No appointments this day" description="Use Book or AI Booking to schedule one." />}
          </div>
        )}
      </Panel>

      <BookingDialog open={dialog !== null} onClose={() => { setDialog(null); setParams({}); }} mode={dialog ?? "manual"} />
    </div>
  );
}
