import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useBranch } from "@/hooks/useBranch";
import { trpc } from "@/providers/trpc";
import { StatusBadge } from "@/components/shared";
import { Tooth3D } from "@/components/Tooth3D";
import { useTilt } from "@/hooks/useTilt";
import { rm, rmShort, fmtTime } from "@/lib/format";
import { Link } from "react-router";
import {
  Users, CalendarCheck, Target, ArrowUpRight, ArrowDownRight,
  Sparkles, CalendarPlus, UserPlus, Megaphone, BellRing, ChevronRight,
  CalendarDays, AlertTriangle, Info, CheckCircle2, Bot,
  Clock, Stethoscope, ClipboardList,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";

const TEAL = "#0DC9B7";
const CYAN = "#12B5E5";
const PURPLE = "#7C5CFC";
const CORAL = "#FF7A7A";
const AMBER = "#FFB020";
const BLUE = "#2E8CFF";
const BAR_PALETTE = [TEAL, CYAN, BLUE, PURPLE, AMBER, CORAL, "#34d399", "#f472b6"];
const DONUT_COLORS = [TEAL, CYAN, PURPLE, BLUE, AMBER, CORAL];

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
function ChartTooltip({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-lg text-sm">
      {label && <p className="font-medium text-slate-600 mb-0.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-semibold" style={{ color: p.color ?? TEAL }}>
          {money ? rm(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

function Panel({ title, subtitle, action, children, className = "" }: any) {
  return (
    <div className={`glass-card min-w-0 p-5 ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-display font-semibold text-[15px] text-slate-800">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function KpiCard({ icon, tint, label, value, delta, down }: any) {
  const tilt = useTilt(8);
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      className="glass-card kpi-tilt p-5 flex flex-col gap-3 cursor-default"
    >
      <div className="h-11 w-11 rounded-2xl flex items-center justify-center text-white shadow-md" style={{ background: tint }}>
        {icon}
      </div>
      <div>
        <p className="text-[12.5px] text-slate-400 font-medium">{label}</p>
        <p className="font-display text-[26px] font-bold text-slate-800 leading-tight">{value}</p>
      </div>
      {delta != null && (
        <p className={`flex items-center gap-1 text-xs font-semibold ${down ? "text-rose-500" : "text-emerald-500"}`}>
          {down ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
          {Math.abs(delta)}% <span className="text-slate-400 font-normal">vs last month</span>
        </p>
      )}
    </div>
  );
}

function GreetingHeader({ name, subtitle }: { name: string; subtitle: string }) {
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[26px] font-bold text-slate-800">
          {greet}, {name} <span className="inline-block animate-pulse">👋</span>
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="glass-card flex items-center gap-2.5 px-4 py-2.5">
        <CalendarDays className="h-4 w-4 text-teal-500" />
        <div className="leading-tight">
          <p className="text-[11px] text-slate-400">{now.toLocaleDateString("en-MY", { weekday: "long" })}</p>
          <p className="text-[13px] font-semibold text-slate-700">{now.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
      </div>
    </div>
  );
}

function HeroRevenue({ d }: { d: any }) {
  const tilt = useTilt(5);
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      className="kpi-tilt relative overflow-hidden rounded-2xl p-5 text-white shadow-xl h-full flex flex-col"
      style={{ background: "linear-gradient(135deg, #0B3B36 0%, #0d6b5e 55%, #0DC9B7 130%)" }}
    >
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-teal-300/10 blur-2xl" />
      <p className="text-[12px] text-teal-100/80 font-medium">Total Revenue (This Month)</p>
      <p className="font-display text-[26px] font-bold mt-1 tracking-tight leading-tight">{rm(d.revenueMonth)}</p>
      <div className="h-20 mt-2 -mx-2 flex-1">
        <ResponsiveContainer>
          <AreaChart data={d.trend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="heroSpark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5ff5e0" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#5ff5e0" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke="#5ff5e0" strokeWidth={2.5} fill="url(#heroSpark)" dot={false} />
            <Tooltip content={<ChartTooltip money />} cursor={{ stroke: "rgba(255,255,255,0.25)" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {d.momPct != null && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold w-fit ${d.momPct >= 0 ? "bg-emerald-400/20 text-emerald-200" : "bg-rose-400/20 text-rose-200"}`}>
          {d.momPct >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(d.momPct)}% <span className="font-normal opacity-80">vs last month</span>
        </span>
      )}
    </div>
  );
}

function ToothCanvasCard() {
  return (
    <div className="glass-card relative overflow-hidden p-2 min-h-[250px] h-full">
      <div className="absolute inset-x-0 top-4 text-center pointer-events-none z-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-500">Medini 3D</p>
      </div>
      <Tooth3D className="h-[250px] w-full" />
      <p className="absolute inset-x-0 bottom-3 text-center text-[11px] text-slate-400 pointer-events-none">
        Drag to rotate 360°
      </p>
    </div>
  );
}

function BranchPerformance({ rows, className = "" }: { rows: any[]; className?: string }) {
  const top = (rows ?? []).slice(0, 6);
  const max = Math.max(1, ...top.map((r) => r.value));
  return (
    <Panel title="Branch Performance" subtitle="This Month" className={className}>
      <div className="space-y-3.5 pt-1">
        {top.map((r, i) => (
          <div key={r.name} className="group">
            <div className="flex justify-between text-[12.5px] mb-1">
              <span className="font-medium text-slate-600">{String(r.name).replace("Medini Dental ", "")}</span>
              <span className="font-semibold text-slate-800">{rmShort(r.value)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 group-hover:opacity-80"
                style={{ width: `${(r.value / max) * 100}%`, background: `linear-gradient(90deg, ${BAR_PALETTE[i % BAR_PALETTE.length]}, ${BAR_PALETTE[i % BAR_PALETTE.length]}cc)` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RevenueOverview({ trend, className = "" }: { trend: any[]; className?: string }) {
  return (
    <Panel title="Revenue Overview" subtitle="Last 30 days" className={className}>
      <div className="h-56">
        <ResponsiveContainer>
          <AreaChart data={trend} margin={{ left: 0, right: 4, top: 8 }}>
            <defs>
              <linearGradient id="gTeal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
                <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => rmShort(v)} width={52} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip money />} />
            <Area type="monotone" dataKey="value" stroke={TEAL} strokeWidth={2.5} fill="url(#gTeal)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function AiInsightCard({ insights }: { insights: any[] }) {
  const first = insights?.[0];
  const pct = first?.body?.match(/(\d+)%/)?.[1];
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 text-white shadow-xl"
      style={{ background: "linear-gradient(150deg, #4c1d95 0%, #7C5CFC 70%, #9d7bff 100%)" }}
    >
      <div className="absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-white/10 blur-xl" />
      <div className="flex items-center gap-2 mb-2.5">
        <span className="h-8 w-8 rounded-xl bg-white/15 flex items-center justify-center"><Bot className="h-4 w-4" /></span>
        <p className="font-display font-semibold text-[14px]">AI Insight</p>
      </div>
      {first ? (
        <>
          <p className="text-[13px] leading-snug text-violet-100">
            {pct ? <>AI predicts <span className="font-display text-[22px] font-bold text-white">{pct}%</span> </> : null}
            {first.title}
          </p>
          <p className="text-[11.5px] text-violet-200/80 mt-1.5 line-clamp-3">{first.body}</p>
        </>
      ) : (
        <p className="text-[13px] text-violet-100">No new insights right now — AI agents are monitoring all branches.</p>
      )}
      <Link to="/ai" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 transition px-3.5 py-1.5 text-xs font-semibold">
        <Sparkles className="h-3.5 w-3.5" /> View Full Insight <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function QuickActions() {
  const items = [
    { label: "New Appointment", to: "/appointments?new=1", icon: CalendarPlus, tint: `linear-gradient(135deg, ${TEAL}, ${CYAN})` },
    { label: "New Patient", to: "/patients?new=1", icon: UserPlus, tint: `linear-gradient(135deg, ${BLUE}, ${PURPLE})` },
    { label: "New Campaign", to: "/marketing", icon: Megaphone, tint: `linear-gradient(135deg, ${PURPLE}, ${CORAL})` },
    { label: "Recall Queue", to: "/patients?recall=1", icon: BellRing, tint: `linear-gradient(135deg, ${AMBER}, ${CORAL})` },
  ];
  return (
    <div className="glass-card p-4 space-y-2">
      <p className="font-display font-semibold text-[14px] text-slate-800 px-1 mb-1">Quick Actions</p>
      {items.map((q) => (
        <Link key={q.label} to={q.to} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-slate-50 transition group">
          <span className="h-8 w-8 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: q.tint }}>
            <q.icon className="h-4 w-4" />
          </span>
          <span className="text-[13px] font-medium text-slate-700 flex-1">{q.label}</span>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-teal-500 group-hover:translate-x-0.5 transition" />
        </Link>
      ))}
    </div>
  );
}

function ScheduleRail({ rows }: { rows: any[] }) {
  const next = (rows ?? []).filter((a) => !["cancelled", "no_show"].includes(a.status)).slice(0, 6);
  return (
    <Panel title="Today's Schedule" action={<Link to="/appointments" className="text-[11px] font-semibold text-teal-600 hover:underline">View All</Link>}>
      <div className="space-y-1 -mx-1">
        <div className="grid grid-cols-[52px_1fr_auto] gap-2 px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          <span>Time</span><span>Patient</span><span>Status</span>
        </div>
        {next.map((a) => (
          <div key={a.id} className="grid grid-cols-[52px_1fr_auto] gap-2 items-center px-1 py-2 rounded-lg hover:bg-slate-50 transition">
            <span className="flex items-center gap-1 text-[11.5px] font-semibold text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${a.status === "in_progress" ? "bg-amber-400" : "bg-teal-400"}`} />
              {fmtTime(a.startAt)}
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-slate-700 truncate">{a.patientName}</p>
              <p className="text-[10.5px] text-slate-400 truncate">{a.doctorName}</p>
            </div>
            <StatusBadge status={a.status} />
          </div>
        ))}
        {!next.length && <p className="text-sm text-slate-400 text-center py-6">No appointments today</p>}
      </div>
    </Panel>
  );
}

function ClinicStatus({ d }: { d: any }) {
  const items = [
    { label: "Operators Today", value: (d.revByDoctor ?? []).length || d.chairsBusy || 0, sub: `${d.chairsBusy}/${d.chairsTotal} chairs busy`, color: "text-teal-600 bg-teal-50" },
    { label: "Conversations", value: d.waOpen, sub: `${d.waUnread} unread`, color: "text-blue-600 bg-blue-50" },
    { label: "Pending Replies", value: d.waUnread, sub: "needs attention", color: "text-rose-500 bg-rose-50" },
  ];
  return (
    <Panel title="Clinic Status Overview" action={<span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live</span>}>
      <div className="grid grid-cols-3 gap-2">
        {items.map((s) => (
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.color.split(" ")[1]}`}>
            <p className={`font-display text-[22px] font-bold ${s.color.split(" ")[0]}`}>{s.value}</p>
            <p className="text-[10px] font-semibold text-slate-500 leading-tight mt-0.5">{s.label}</p>
            <p className="text-[9.5px] text-slate-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Utilization({ d }: { d: any }) {
  const pct = d.chairsTotal > 0 ? Math.round((d.chairsBusy / d.chairsTotal) * 100) : 0;
  return (
    <Panel title="Operatory Utilization">
      <p className="font-display text-[30px] font-bold text-slate-800">{pct}%</p>
      <p className="text-[11px] text-slate-400 mb-2.5">{d.chairsBusy} of {d.chairsTotal} operatories in use</p>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${TEAL}, ${CYAN})` }} />
      </div>
    </Panel>
  );
}

const STATUS_BLOCK: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  booked: "bg-sky-100 text-sky-700 border-sky-200",
  completed: "bg-teal-100 text-teal-700 border-teal-200",
  checked_in: "bg-emerald-100 text-emerald-700 border-emerald-200",
  in_progress: "bg-violet-100 text-violet-700 border-violet-200",
  cancelled: "bg-rose-100 text-rose-600 border-rose-200",
  no_show: "bg-amber-100 text-amber-700 border-amber-200",
};

function WeekCalendar({ branchId, className = "" }: { branchId: number | null; className?: string }) {
  const { from, to, days } = useMemo(() => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // Monday = 0
    const mon = new Date(now); mon.setDate(now.getDate() - dow); mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
    return { from: mon, to: sun, days };
  }, []);
  const q = trpc.appointments.list.useQuery({ branchId, from, to });

  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of q.data ?? []) {
      const key = new Date(r.appointment.startAt).toDateString();
      (map[key] ??= []).push(r);
    }
    Object.values(map).forEach((arr) => arr.sort((a, b) => +new Date(a.appointment.startAt) - +new Date(b.appointment.startAt)));
    return map;
  }, [q.data]);

  return (
    <Panel title="Upcoming Appointments" subtitle="This week" className={className}
      action={<Link to="/appointments" className="text-[11px] font-semibold text-teal-600 hover:underline">Calendar View</Link>}>
      <div className="overflow-x-auto -mx-1 px-1">
      <div className="grid grid-cols-7 gap-1.5 min-w-[620px]">
        {days.map((d) => {
          const rows = byDay[d.toDateString()] ?? [];
          const isToday = d.toDateString() === new Date().toDateString();
          return (
            <div key={d.toISOString()} className={`rounded-xl border p-1.5 min-h-[130px] ${isToday ? "border-teal-300 bg-teal-50/50" : "border-slate-100 bg-slate-50/40"}`}>
              <p className={`text-center text-[10px] font-bold uppercase ${isToday ? "text-teal-600" : "text-slate-400"}`}>
                {d.toLocaleDateString("en-MY", { weekday: "short" })}
              </p>
              <p className={`text-center text-[13px] font-display font-bold mb-1.5 ${isToday ? "text-teal-600" : "text-slate-700"}`}>{d.getDate()}</p>
              <div className="space-y-1">
                {rows.slice(0, 3).map((r) => (
                  <div key={r.appointment.id} className={`rounded-md border px-1 py-0.5 text-[9px] leading-tight ${STATUS_BLOCK[r.appointment.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                    <p className="font-semibold truncate">{fmtTime(r.appointment.startAt)} {r.patientName?.split(" ")[0]}</p>
                  </div>
                ))}
                {rows.length > 3 && <p className="text-center text-[9px] text-slate-400">+{rows.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </Panel>
  );
}

function MonthlyTrend({ data, className = "" }: { data: any[]; className?: string }) {
  return (
    <Panel title="Monthly Revenue Trend" subtitle="Last 12 months" className={className}>
      <div className="h-56">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ left: 0, right: 4, top: 8 }}>
            <defs>
              <linearGradient id="gCyan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CYAN} stopOpacity={0.35} />
                <stop offset="100%" stopColor={CYAN} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => rmShort(v)} width={52} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip money />} />
            <Area type="monotone" dataKey="value" stroke={CYAN} strokeWidth={2.5} fill="url(#gCyan)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function TopTreatmentsDonut({ rows, className = "" }: { rows: any[]; className?: string }) {
  const top = (rows ?? []).slice(0, 5);
  const total = top.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <Panel title="Top Treatments" subtitle="This period" className={className}>
      <div className="flex items-center gap-3">
        <div className="h-44 w-44 shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={top} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                {top.map((_: any, i: number) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip money />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {top.map((r, i) => (
            <div key={r.name} className="flex items-center gap-2 text-[12px]">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="flex-1 text-slate-600 truncate">{r.name}</span>
              <span className="font-semibold text-slate-800">{Math.round((r.value / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function AlertsPanel({ insights, className = "" }: { insights: any[]; className?: string }) {
  const icons: Record<string, any> = { warning: AlertTriangle, success: CheckCircle2, info: Info };
  const tints: Record<string, string> = {
    warning: "bg-amber-50 text-amber-600 border-amber-100",
    success: "bg-emerald-50 text-emerald-600 border-emerald-100",
    info: "bg-blue-50 text-blue-600 border-blue-100",
  };
  return (
    <Panel title="Alerts & Notifications" subtitle="From AI Manager" className={className}>
      <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
        {(insights ?? []).map((a, i) => {
          const Icon = icons[a.severity] ?? Info;
          return (
            <div key={i} className={`flex gap-3 rounded-xl border p-3 ${tints[a.severity] ?? tints.info}`}>
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-slate-800">{a.title}</p>
                <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{a.body}</p>
              </div>
            </div>
          );
        })}
        {!insights?.length && <p className="text-sm text-slate-400 text-center py-6">All clear — no alerts</p>}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// PHASE 4 — Intelligence layer UI (deterministic, role-scoped)
// ---------------------------------------------------------------------------
const SEV_STYLE: Record<string, { dot: string; badge: string; label: string }> = {
  critical: { dot: "bg-rose-500", badge: "bg-rose-50 text-rose-600 border-rose-200", label: "Critical" },
  high:     { dot: "bg-amber-500", badge: "bg-amber-50 text-amber-600 border-amber-200", label: "High" },
  medium:   { dot: "bg-blue-500", badge: "bg-blue-50 text-blue-600 border-blue-200", label: "Medium" },
  info:     { dot: "bg-slate-400", badge: "bg-slate-50 text-slate-500 border-slate-200", label: "Info" },
};

function DeltaChip({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${up ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
      {up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {Math.abs(pct)}%
    </span>
  );
}

function PriorityPanel({ intel, className = "" }: { intel: any; className?: string }) {
  const items = intel?.priority ?? [];
  return (
    <Panel title="What Needs Your Attention" subtitle="Deterministic · role-scoped" className={className}
      action={<span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 border border-slate-200 rounded-full px-2 py-0.5">Rule-based</span>}>
      <div className="space-y-2.5">
        {items.map((p: any) => {
          const s = SEV_STYLE[p.severity] ?? SEV_STYLE.info;
          return (
            <div key={p.rank} className="flex gap-3 items-start rounded-xl border border-slate-100 bg-white p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{p.rank}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[12.5px] font-semibold text-slate-800 truncate">{p.action}</p>
                  <span className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase ${s.badge}`}>{s.label}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{p.why}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function SignalsPanel({ intel, className = "" }: { intel: any; className?: string }) {
  const signals = intel?.signals ?? [];
  return (
    <Panel title="Operational Signals" subtitle="Derived from live data" className={className}>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {signals.map((s: any) => {
          const st = SEV_STYLE[s.severity] ?? SEV_STYLE.info;
          return (
            <div key={s.id} className="flex gap-2.5 items-start rounded-lg px-2 py-2 hover:bg-slate-50 transition">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-slate-700">{s.title}</p>
                <p className="text-[10.5px] text-slate-400 line-clamp-2">{s.body}</p>
              </div>
            </div>
          );
        })}
        {!signals.length && <p className="text-sm text-slate-400 text-center py-6">No active signals — all within normal range</p>}
      </div>
    </Panel>
  );
}

function IntelKpiStrip({ intel }: { intel: any }) {
  const k = intel?.kpis ?? {};
  const cards = [
    { label: "Appts Today", value: k.apptToday ?? 0, delta: k.apptDeltaPct, show: true },
    { label: "Completion (7d)", value: k.completionWk != null ? `${k.completionWk}%` : "—", delta: k.completionDeltaPct, show: true },
    { label: "Waiting Now", value: k.waitingNow ?? 0, delta: null, show: true },
    { label: "Unread WA", value: k.waUnread ?? 0, delta: null, show: true },
    { label: "Chair Util", value: k.utilPct != null ? `${k.utilPct}%` : "—", delta: null, show: true },
    // financial tile only rendered when the server actually returned a value
    { label: "Revenue Today", value: k.revToday != null ? rm(k.revToday) : null, delta: k.revDeltaPct, show: k.revToday != null },
  ].filter((c) => c.show);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="glass-card p-3.5">
          <p className="text-[10.5px] font-medium text-slate-400">{c.label}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="font-display text-[19px] font-bold text-slate-800">{c.value}</p>
            <DeltaChip pct={c.delta} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BranchPulsePanel({ intel, className = "" }: { intel: any; className?: string }) {
  const leaders = intel?.branchLeaders ?? [];
  const laggards = intel?.branchLaggards ?? [];
  if (!leaders.length) return null;
  const max = Math.max(1, ...leaders.map((b: any) => b.value));
  return (
    <Panel title="Branch Pulse (7d)" subtitle="Top & bottom by appointments" className={className}>
      <div className="space-y-3">
        {leaders.map((b: any) => (
          <div key={b.name}>
            <div className="flex justify-between text-[11.5px] mb-1">
              <span className="text-slate-600 font-medium">{b.name}</span>
              <span className="font-bold text-slate-800">{b.value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#0DC9B7] to-[#12B5E5]" style={{ width: `${(b.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {laggards.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1.5">Needs attention</p>
            {laggards.map((b: any) => (
              <div key={b.name} className="flex justify-between text-[11px] text-amber-700 py-0.5">
                <span>{b.name}</span><span className="font-semibold">{b.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Role dashboards
// ---------------------------------------------------------------------------
function BusinessDashboard({ d, branchId, insights, reports, intel }: any) {
  const monthly = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const r of reports?.revTrend ?? []) {
      const m = new Date(r.date).toLocaleDateString("en-MY", { month: "short" });
      buckets[m] = (buckets[m] ?? 0) + r.value;
    }
    return Object.entries(buckets).map(([month, value]) => ({ month, value }));
  }, [reports]);

  return (
    <div className="space-y-8">
      {/* PHASE 4: intelligence strip + priority + signals */}
      {intel && <IntelKpiStrip intel={intel} />}
      {intel && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PriorityPanel intel={intel} className="lg:col-span-2" />
          <SignalsPanel intel={intel} />
        </div>
      )}
      {/* ROW 1: 4 KPI cards + 3D canvas box */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <HeroRevenue d={d} />
        <KpiCard icon={<Users className="h-5 w-5" />} tint={`linear-gradient(135deg, ${TEAL}, ${CYAN})`} label="Total Patients" value={d.totalPatients.toLocaleString()} delta={12.4} />
        <KpiCard icon={<CalendarCheck className="h-5 w-5" />} tint={`linear-gradient(135deg, ${BLUE}, ${PURPLE})`} label="Appointments (Month)" value={d.appointmentsMonth.toLocaleString()} delta={8.7} />
        <KpiCard icon={<Target className="h-5 w-5" />} tint={`linear-gradient(135deg, ${PURPLE}, ${CORAL})`} label="Conversion Rate" value={`${d.conversionPct}%`} delta={6.3} />
        <ToothCanvasCard />
      </div>

      {/* ROW 2: main line chart + today's schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <RevenueOverview trend={d.trend} className="lg:col-span-2" />
        <ScheduleRail rows={d.todayAppts} />
      </div>

      {/* ROW 3: branch performance + donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BranchPerformance rows={d.revByBranch ?? reports?.revByBranch ?? []} className="lg:col-span-2" />
        <TopTreatmentsDonut rows={reports?.revByTreatment ?? []} />
      </div>

      {/* ROW 4: week calendar + AI insight / quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <WeekCalendar branchId={branchId} className="lg:col-span-2" />
        <div className="space-y-6">
          <AiInsightCard insights={insights} />
          <QuickActions />
        </div>
      </div>

      {/* ROW 5: monthly trend + clinic status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MonthlyTrend data={monthly} className="lg:col-span-2" />
        <div className="space-y-6">
          <ClinicStatus d={d} />
          <Utilization d={d} />
        </div>
      </div>

      {/* ROW 6: revenue by branch + alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Revenue by Branch" subtitle="This period" className="lg:col-span-2">
          <div className="space-y-3 pt-1 max-h-52 overflow-y-auto pr-1">
            {(reports?.revByBranch ?? d.revByBranch ?? []).slice(0, 6).map((r: any, i: number) => {
              const max = Math.max(1, ...(reports?.revByBranch ?? d.revByBranch ?? []).map((x: any) => x.value));
              return (
                <div key={r.name}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-slate-600">{String(r.name).replace("Medini Dental ", "")}</span>
                    <span className="font-semibold text-slate-800">{rmShort(r.value)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: BAR_PALETTE[i % BAR_PALETTE.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <AlertsPanel insights={insights} />
        <BranchPulsePanel intel={intel} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 3.1 §18 — Receptionist (branch_admin) workspace: front-desk only.
// NO financial truth — HeroRevenue, RevenueOverview, revenue trends and any
// monetary widget are deliberately absent. Server also strips these fields.
// ---------------------------------------------------------------------------
function ReceptionistDashboard({ d, intel }: any) {
  return (
    <div className="space-y-8">
      {/* PHASE 4: role-scoped priority & signals (no financial) */}
      {intel && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PriorityPanel intel={intel} className="lg:col-span-2" />
          <SignalsPanel intel={intel} />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <KpiCard icon={<CalendarCheck className="h-5 w-5" />} tint={`linear-gradient(135deg, ${TEAL}, ${CYAN})`} label="Today's Appointments" value={d.appointmentsToday ?? 0} />
        <KpiCard icon={<Clock className="h-5 w-5" />} tint={`linear-gradient(135deg, ${BLUE}, ${PURPLE})`} label="Waiting Now" value={d.waitingNow ?? 0} />
        <KpiCard icon={<Stethoscope className="h-5 w-5" />} tint={`linear-gradient(135deg, ${PURPLE}, ${CORAL})`} label="In Progress" value={d.inProgress ?? 0} />
        <KpiCard icon={<Users className="h-5 w-5" />} tint={`linear-gradient(135deg, ${AMBER}, ${CORAL})`} label="New Patients (Month)" value={d.newPatientsMonth ?? 0} />
        <ToothCanvasCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ScheduleRail rows={d.todayAppts ?? []} />
        <ClinicStatus d={d} />
        <Utilization d={d} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <WeekCalendar branchId={null} className="lg:col-span-2" />
        <QuickActions />
      </div>
    </div>
  );
}

function DoctorDashboard({ d, intel }: any) {
  return (
    <div className="space-y-8">
      {/* PHASE 4: clinical priority & signals (no financial) */}
      {intel && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PriorityPanel intel={intel} className="lg:col-span-2" />
          <SignalsPanel intel={intel} />
        </div>
      )}
      {/* ROW 1: 4 KPI cards + 3D canvas box */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <KpiCard icon={<CalendarCheck className="h-5 w-5" />} tint={`linear-gradient(135deg, ${TEAL}, ${CYAN})`} label="Today's Schedule" value={d.mySchedule?.length ?? 0} />
        <KpiCard icon={<Clock className="h-5 w-5" />} tint={`linear-gradient(135deg, ${BLUE}, ${PURPLE})`} label="Waiting Patients" value={d.myWaiting ?? 0} />
        <KpiCard icon={<Stethoscope className="h-5 w-5" />} tint={`linear-gradient(135deg, ${PURPLE}, ${CORAL})`} label="Completed Today" value={d.myCompletedToday ?? 0} />
        <KpiCard icon={<ClipboardList className="h-5 w-5" />} tint={`linear-gradient(135deg, ${AMBER}, ${CORAL})`} label="Pending Notes" value={d.pendingNotes ?? 0} />
        <ToothCanvasCard />
      </div>

      {/* ROW 2: schedule + stats / quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Today's Schedule" subtitle="Your patients" className="lg:col-span-2">
          <div className="divide-y divide-slate-100">
            {(d.mySchedule ?? []).map((a: any) => (
              <div key={a.id} className="flex items-center gap-4 py-3">
                <div className="w-20 text-center">
                  <p className="text-sm font-bold text-slate-800">{fmtTime(a.startAt)}</p>
                  <p className="text-[10px] text-slate-400">{fmtTime(a.endAt)}</p>
                </div>
                <div className="h-10 w-1 rounded-full bg-slate-100">
                  <div className={a.status === "completed" ? "h-full w-full rounded-full bg-teal-400" : a.status === "in_progress" ? "h-1/2 w-full rounded-full bg-violet-400" : ""} />
                </div>
                <div className="flex-1 min-w-0">
                  <Link to={`/patients/${a.patientId}`} className="text-sm font-semibold text-slate-800 hover:text-teal-600">{a.patientName}</Link>
                  {a.notes && <p className="text-xs text-slate-400 truncate">{a.notes}</p>}
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
            {!d.mySchedule?.length && <p className="text-sm text-slate-400 text-center py-8">No appointments scheduled today</p>}
          </div>
        </Panel>
        <div className="space-y-6">
          <Panel title="My Stats" subtitle="This month">
            <div className="space-y-2.5">
              {[
                { label: "Follow-ups upcoming", value: d.followUps ?? 0, icon: BellRing, tint: "text-amber-500" },
                { label: "Pending notes", value: d.pendingNotes ?? 0, icon: ClipboardList, tint: "text-violet-500" },
                { label: "Completed today", value: d.myCompletedToday ?? 0, icon: CheckCircle2, tint: "text-teal-500" },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                  <span className="flex items-center gap-2 text-[13px] text-slate-600"><r.icon className={`h-4 w-4 ${r.tint}`} /> {r.label}</span>
                  <span className="font-bold text-slate-800">{r.value}</span>
                </div>
              ))}
            </div>
          </Panel>
          <QuickActions />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function Dashboard() {
  const { user } = useAuth();
  const { branchId } = useBranch();
  const stats = trpc.dashboard.stats.useQuery({ branchId }, { refetchInterval: 60000 });
  const isDoctor = user?.role === "doctor";
  const isReception = user?.role === "branch_admin";
  // Phase 3.1 — reports is HQ/BM-only now; never fire it for receptionist/doctor
  const canSeeReports = user?.role === "hq" || user?.role === "branch_manager";
  const insightsQ = trpc.ai.insights.useQuery({ branchId }, { enabled: canSeeReports });
  const reportsQ = trpc.reports.overview.useQuery({ branchId, days: 365 }, { enabled: canSeeReports });
  // Phase 4 — centralized intelligence layer (server-side role-scoped)
  const intelQ = trpc.intelligence.signals.useQuery({ branchId }, { refetchInterval: 60000 });
  const intel = intelQ.data ?? null;

  const subtitle: Record<string, string> = {
    hq: "Here's what's happening across all 14 branches",
    branch_manager: "Here's your branch performance today",
    branch_admin: "Here's today's operational overview",
    doctor: "Here's your practice schedule today",
  };

  const shortName = user?.name?.startsWith("Dr")
    ? user.name.split(" ").slice(0, 2).join(" ")
    : user?.name?.split(" ")[0] ?? "";

  return (
    <div className="space-y-6">
      <GreetingHeader name={shortName} subtitle={subtitle[user?.role ?? "doctor"]} />
      {stats.isLoading ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {[...Array(5)].map((_, i) => <div key={i} className="glass-card h-44 animate-pulse" />)}
          </div>
          <div className="glass-card h-72 animate-pulse" />
          <div className="glass-card h-56 animate-pulse" />
        </div>
      ) : stats.data ? (
        isDoctor ? (
          <DoctorDashboard d={stats.data} intel={intel} />
        ) : isReception ? (
          <ReceptionistDashboard d={stats.data} intel={intel} />
        ) : (
          <BusinessDashboard d={stats.data} branchId={branchId} insights={insightsQ.data ?? []} reports={reportsQ.data} intel={intel} />
        )
      ) : (
        <div className="glass-card p-10 text-center text-slate-400">Unable to load dashboard</div>
      )}
    </div>
  );
}
