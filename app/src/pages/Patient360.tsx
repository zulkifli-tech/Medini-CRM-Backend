import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, StatusBadge, Panel, EmptyState } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { rm, fmtDate, fmtDateTime, fmtTime, age, initials } from "@/lib/format";
import {
  Phone, Mail, AlertTriangle, ShieldCheck, Star, CalendarDays,
  Stethoscope, Pill, FolderOpen, Wallet, MessageSquare, ArrowLeft, Activity,
} from "lucide-react";

export default function Patient360() {
  const { id } = useParams();
  const data = trpc.patients.get360.useQuery({ id: Number(id) }, { enabled: !!id });

  if (data.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }
  if (!data.data) return <EmptyState title="Patient not found" />;

  const p = data.data.patient;
  const totalBilled = data.data.invoices.reduce((s: number, i: any) => s + Number(i.total), 0);
  const totalPaid = data.data.payments.reduce((s: number, pay: any) => s + (pay.kind === "refund" ? -1 : 1) * Number(pay.amount), 0);

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader
        title={p.name}
        description={`${p.mrn} · Registered ${fmtDate(p.createdAt)}`}
        actions={<Link to="/patients"><span className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-600"><ArrowLeft className="h-4 w-4" /> Back to Patients</span></Link>}
      />

      {/* Profile header card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16"><AvatarFallback className="bg-emerald-600 text-white text-xl">{initials(p.name)}</AvatarFallback></Avatar>
            <div>
              <p className="text-lg font-bold text-slate-900">{p.name}</p>
              <p className="text-sm text-slate-500">{age(p.dob)} · {p.gender} · {data.data.branchName}</p>
              <div className="flex gap-1.5 mt-1.5">
                <StatusBadge status={p.source} className="bg-slate-100 text-slate-600" />
                {p.allergies && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700"><AlertTriangle className="h-3 w-3" /> {p.allergies}</span>}
              </div>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 min-w-[280px]">
            {[
              { icon: Phone, label: "Phone", value: p.phone },
              { icon: Mail, label: "Email", value: p.email ?? "—" },
              { icon: ShieldCheck, label: "Insurance", value: data.data.panelName ?? "Self-pay" },
              { icon: Star, label: "Loyalty Points", value: p.loyaltyPoints.toLocaleString() },
            ].map((f) => (
              <div key={f.label} className="flex items-start gap-2.5">
                <f.icon className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-400 uppercase font-medium">{f.label}</p>
                  <p className="text-sm font-medium text-slate-700 truncate">{f.value}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-6 border-l border-slate-100 pl-6">
            <div className="text-center">
              <p className="text-xl font-bold text-slate-900">{rm(totalBilled, 0)}</p>
              <p className="text-[11px] text-slate-400">Total Billed</p>
            </div>
            <div className="text-center">
              <p className={`text-xl font-bold ${totalBilled - totalPaid > 0 ? "text-amber-600" : "text-emerald-600"}`}>{rm(Math.max(0, totalBilled - totalPaid), 0)}</p>
              <p className="text-[11px] text-slate-400">Outstanding</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-slate-900">{fmtDate(p.nextRecallAt)}</p>
              <p className="text-[11px] text-slate-400">Next Recall</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="journey">
        <TabsList className="bg-white border">
          <TabsTrigger value="journey"><Activity className="h-3.5 w-3.5 mr-1.5" />Journey</TabsTrigger>
          <TabsTrigger value="appointments"><CalendarDays className="h-3.5 w-3.5 mr-1.5" />Appointments ({data.data.appointments.length})</TabsTrigger>
          <TabsTrigger value="clinical"><Stethoscope className="h-3.5 w-3.5 mr-1.5" />Clinical ({data.data.notes.length})</TabsTrigger>
          <TabsTrigger value="plans">Treatment Plans ({data.data.plans.length})</TabsTrigger>
          <TabsTrigger value="prescriptions"><Pill className="h-3.5 w-3.5 mr-1.5" />Rx ({data.data.prescriptions.length})</TabsTrigger>
          <TabsTrigger value="documents"><FolderOpen className="h-3.5 w-3.5 mr-1.5" />Documents ({data.data.documents.length})</TabsTrigger>
          <TabsTrigger value="finance"><Wallet className="h-3.5 w-3.5 mr-1.5" />Finance</TabsTrigger>
          <TabsTrigger value="comms"><MessageSquare className="h-3.5 w-3.5 mr-1.5" />WhatsApp</TabsTrigger>
        </TabsList>

        <TabsContent value="journey" className="mt-4">
          <Panel title="Patient Journey Timeline">
            <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-200 max-h-[520px] overflow-y-auto">
              {[
                ...data.data.appointments.slice(0, 10).map((a: any) => ({
                  at: a.appointment.startAt, icon: CalendarDays, color: "bg-blue-500",
                  title: `Appointment — ${a.treatmentName ?? "Visit"}`, sub: `${a.doctorName} · ${a.appointment.status}`,
                })),
                ...data.data.notes.slice(0, 8).map((n: any) => ({
                  at: n.note.createdAt, icon: Stethoscope, color: "bg-emerald-500",
                  title: `Clinical note — ${n.note.diagnosis ?? "Note"}`, sub: n.doctorName,
                })),
                ...data.data.payments.slice(0, 8).map((pay: any) => ({
                  at: pay.paidAt, icon: Wallet, color: "bg-amber-500",
                  title: `Payment ${rm(pay.amount)} (${pay.method})`, sub: pay.kind,
                })),
                ...data.data.conversations.map((c: any) => ({
                  at: c.lastMessageAt, icon: MessageSquare, color: "bg-violet-500",
                  title: "WhatsApp conversation", sub: c.status.replace("_", " "),
                })),
              ]
                .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                .slice(0, 25)
                .map((ev, i) => (
                  <div key={i} className="relative flex gap-4">
                    <div className={`absolute -left-6 top-1 h-4 w-4 rounded-full ${ev.color} ring-4 ring-white flex items-center justify-center`} />
                    <div className="flex-1 pb-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-800">{ev.title}</p>
                        <span className="text-xs text-slate-400">{fmtDateTime(ev.at)}</span>
                      </div>
                      <p className="text-xs text-slate-400 capitalize">{ev.sub}</p>
                    </div>
                  </div>
                ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="appointments" className="mt-4">
          <Panel>
            <div className="divide-y divide-slate-100">
              {data.data.appointments.map((a: any) => (
                <div key={a.appointment.id} className="flex items-center gap-4 py-3">
                  <div className="w-28"><p className="text-sm font-semibold text-slate-800">{fmtDate(a.appointment.startAt)}</p><p className="text-xs text-slate-400">{fmtTime(a.appointment.startAt)}</p></div>
                  <div className="flex-1"><p className="text-sm font-medium text-slate-700">{a.treatmentName ?? "General visit"}</p><p className="text-xs text-slate-400">{a.doctorName} · {a.appointment.source}</p></div>
                  <StatusBadge status={a.appointment.status} />
                </div>
              ))}
              {!data.data.appointments.length && <EmptyState title="No appointments yet" />}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="clinical" className="mt-4">
          <Panel>
            <div className="space-y-4">
              {data.data.notes.map((n: any) => (
                <div key={n.note.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-slate-800">{n.note.diagnosis ?? "Clinical note"}</p>
                    <span className="text-xs text-slate-400">{fmtDateTime(n.note.createdAt)} · {n.doctorName}</span>
                  </div>
                  <p className="text-sm text-slate-600">{n.note.notes}</p>
                  {n.note.procedures && <p className="text-xs text-emerald-600 mt-2 font-medium">Procedures: {n.note.procedures}</p>}
                </div>
              ))}
              {!data.data.notes.length && <EmptyState title="No clinical notes" />}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          <div className="space-y-4">
            {data.data.plans.map((pl: any) => (
              <Panel key={pl.id} title={pl.title} subtitle={`${fmtDate(pl.createdAt)} · Dr. ${data.data.notes.find(() => true) ?? ""}`} action={<StatusBadge status={pl.status} />}>
                <div className="space-y-2">
                  {data.data.planItems.filter((it: any) => it.planId === pl.id).map((it: any) => (
                    <div key={it.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className={`h-2 w-2 rounded-full ${it.status === "done" ? "bg-emerald-500" : "bg-amber-400"}`} />
                        <span className="text-sm text-slate-700">{it.description}{it.toothNo ? ` · Tooth ${it.toothNo}` : ""}</span>
                      </div>
                      <span className="text-sm font-medium text-slate-800">{rm(it.price)}</span>
                    </div>
                  ))}
                  <div className="flex justify-end pt-1">
                    <span className="text-sm font-bold text-slate-900">
                      Total: {rm(data.data.planItems.filter((it: any) => it.planId === pl.id).reduce((s: number, it: any) => s + Number(it.price) * it.qty, 0))}
                    </span>
                  </div>
                </div>
              </Panel>
            ))}
            {!data.data.plans.length && <Panel><EmptyState title="No treatment plans" /></Panel>}
          </div>
        </TabsContent>

        <TabsContent value="prescriptions" className="mt-4">
          <Panel>
            <div className="divide-y divide-slate-100">
              {data.data.prescriptions.map((r: any) => (
                <div key={r.rx.id} className="py-3 flex items-center gap-4">
                  <Pill className="h-4 w-4 text-violet-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{r.rx.medication} <span className="text-slate-400 font-normal">{r.rx.dosage}</span></p>
                    <p className="text-xs text-slate-400">{r.rx.frequency} · {r.rx.durationDays} days · {r.doctorName}</p>
                  </div>
                  <span className="text-xs text-slate-400">{fmtDate(r.rx.createdAt)}</span>
                </div>
              ))}
              {!data.data.prescriptions.length && <EmptyState title="No prescriptions" />}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.data.documents.map((doc: any) => (
              <div key={doc.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow-md transition">
                <div className="h-28 bg-slate-900 flex items-center justify-center">
                  <FolderOpen className="h-8 w-8 text-slate-600" />
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium text-slate-700 truncate">{doc.title}</p>
                  <p className="text-[10px] text-slate-400 uppercase">{doc.kind.replace("_", " ")} · {fmtDate(doc.createdAt)}</p>
                </div>
              </div>
            ))}
            {!data.data.documents.length && <div className="col-span-4"><EmptyState title="No documents uploaded" /></div>}
          </div>
        </TabsContent>

        <TabsContent value="finance" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Invoices">
              <div className="divide-y divide-slate-100">
                {data.data.invoices.map((inv: any) => (
                  <div key={inv.id} className="py-2.5 flex items-center justify-between">
                    <div><p className="text-sm font-medium text-slate-800">{inv.number}</p><p className="text-xs text-slate-400">{fmtDate(inv.issuedAt)}</p></div>
                    <div className="flex items-center gap-3"><span className="text-sm font-semibold">{rm(inv.total)}</span><StatusBadge status={inv.status} /></div>
                  </div>
                ))}
                {!data.data.invoices.length && <EmptyState title="No invoices" />}
              </div>
            </Panel>
            <Panel title="Payment Timeline">
              <div className="divide-y divide-slate-100">
                {data.data.payments.map((pay: any) => (
                  <div key={pay.id} className="py-2.5 flex items-center justify-between">
                    <div><p className="text-sm font-medium text-slate-800 capitalize">{pay.kind} · {pay.method.replace("_", " ")}</p><p className="text-xs text-slate-400">{fmtDateTime(pay.paidAt)} · {pay.reference}</p></div>
                    <span className={`text-sm font-semibold ${pay.kind === "refund" ? "text-red-600" : "text-emerald-600"}`}>{pay.kind === "refund" ? "-" : "+"}{rm(pay.amount)}</span>
                  </div>
                ))}
                {!data.data.payments.length && <EmptyState title="No payments" />}
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="comms" className="mt-4">
          <Panel title="WhatsApp Conversations">
            <div className="divide-y divide-slate-100">
              {data.data.conversations.map((c: any) => (
                <div key={c.id} className="py-3 flex items-center justify-between">
                  <div><p className="text-sm font-medium text-slate-800">{c.contactName}</p><p className="text-xs text-slate-400">AI Agent: {c.aiAgent} · {fmtDateTime(c.lastMessageAt)}</p></div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
              {!data.data.conversations.length && <EmptyState title="No WhatsApp conversations" />}
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
