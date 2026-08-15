import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useBranch } from "@/hooks/useBranch";
import { PageHeader, StatCard, Panel, StatusBadge, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { rm, rmShort } from "@/lib/format";
import { Download, TrendingUp, Users, Bot, BellRing, Percent } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";

const GREEN = "#0d9d6c";
const COLORS = ["#0d9d6c", "#2563eb", "#f59e0b", "#8b5cf6", "#ef4444", "#64748b", "#06b6d4", "#84cc16"];

function ChartTip({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-slate-700">{label}</p>
      {payload.map((p: any, i: number) => <p key={i} className="font-semibold" style={{ color: p.color ?? GREEN }}>{p.name}: {money ? rm(p.value) : p.value}</p>)}
    </div>
  );
}

export default function Reports() {
  const { branchId } = useBranch();
  const [days, setDays] = useState(30);
  const r = trpc.reports.overview.useQuery({ branchId, days });

  if (r.isLoading) {
    return <div className="space-y-5 -mt-6"><PageHeader title="Reports & Analytics" /><div className="grid gap-4 sm:grid-cols-4">{[1, 2, 3, 4].map((i) => <StatCard key={i} title="" value="" loading />)}</div><Skeleton className="h-80 w-full" /></div>;
  }
  const d = r.data;
  if (!d) return <EmptyState title="Unable to load reports" />;

  const totalRevenue = d.revTrend.reduce((s, x) => s + x.value, 0);
  const statusData = Object.entries(d.apptByStatus).map(([k, v]) => ({ name: k.replace("_", " "), value: v as number }));

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader
        title="Reports & Analytics"
        description={`Business intelligence for the last ${days} days`}
        actions={
          <>
            <div className="flex rounded-lg border overflow-hidden">
              {[7, 30, 60].map((n) => (
                <button key={n} onClick={() => setDays(n)} className={`px-3 py-1.5 text-xs font-medium ${days === n ? "bg-emerald-600 text-white" : "bg-white text-slate-500"}`}>{n}D</button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => toast.success("Report exported (PDF queued)")}><Download className="h-4 w-4 mr-1.5" /> Export</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Revenue" value={rm(totalRevenue, 0)} icon={<TrendingUp className="h-4 w-4" />} sub={`Last ${days} days`} />
        <StatCard title="Appointment Conversion" value={`${d.conversionRate}%`} icon={<Percent className="h-4 w-4" />} sub={`No-show rate: ${d.noShowRate}%`} />
        <StatCard title="New vs Returning" value={`${d.newPatients} / ${d.returningPatients}`} icon={<Users className="h-4 w-4" />} sub="patients in period" />
        <StatCard title="Recall Pipeline" value={d.recallDue} icon={<BellRing className="h-4 w-4" />} sub={`${d.recallBooked} already booked`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Revenue Trend" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={d.revTrend} margin={{ left: 0, right: 8, top: 8 }}>
                <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GREEN} stopOpacity={0.3} /><stop offset="100%" stopColor={GREEN} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => rmShort(v)} width={56} />
                <Tooltip content={<ChartTip money />} />
                <Area type="monotone" dataKey="value" name="Revenue" stroke={GREEN} strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Appointment Funnel">
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Revenue by Branch">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={d.revByBranch} layout="vertical" margin={{ left: 8, right: 12 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} tickFormatter={(v) => v.replace("Medini Dental ", "")} />
                <Tooltip content={<ChartTip money />} />
                <Bar dataKey="value" name="Revenue" fill={GREEN} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Revenue by Treatment Category">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={d.revByTreatment} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => rmShort(v)} width={52} />
                <Tooltip content={<ChartTip money />} />
                <Bar dataKey="value" name="Revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Booking Source Mix" subtitle="AI vs manual vs walk-in">
          <div className="h-60">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.apptBySource} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {d.apptBySource.map((_, i) => <Cell key={i} fill={["#0d9d6c", "#2563eb", "#f59e0b"][i % 3]} />)}
                </Pie>
                <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Doctor KPI" subtitle={`Completed visits & attributed revenue, ${days} days`}>
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead>Doctor</TableHead><TableHead>Branch</TableHead>
                <TableHead className="text-right">Visits</TableHead><TableHead className="text-right">Revenue</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {d.doctorKpi.map((doc, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{doc.name}</TableCell>
                    <TableCell className="text-xs text-slate-500">{(doc.branch ?? "").replace("Medini Dental ", "")}</TableCell>
                    <TableCell className="text-right text-sm">{doc.visits}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-emerald-600">{rm(doc.revenue, 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="AI Performance" subtitle={`${d.aiTotal} actions in period · ${d.aiEscalated} escalations`}>
            <div className="space-y-2">
              {d.aiByAgent.map((a) => (
                <div key={a.name} className="flex items-center gap-3">
                  <Bot className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="w-36 text-sm capitalize text-slate-600">{a.name.replace("_", " ")}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(a.value / Math.max(...d.aiByAgent.map((x) => x.value), 1)) * 100}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-slate-800 w-10 text-right">{a.value}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Patient Growth" subtitle="New registrations by month">
            <div className="h-44">
              <ResponsiveContainer>
                <BarChart data={d.patientGrowth} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="value" name="New patients" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Marketing Campaigns" subtitle="ROI snapshot">
            <div className="space-y-2">
              {d.campaigns.slice(0, 4).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.sentCount} sent · {c.respondedCount} responded{c.sentCount ? ` (${Math.round((c.respondedCount / c.sentCount) * 100)}%)` : ""}</p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
