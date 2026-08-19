import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, StatCard, Panel, EmptyState } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { rm } from "@/lib/format";
import { TrendingUp } from "lucide-react";

/* S10 T1: all six S9 reports endpoints are live backend data. */
interface Kpi { key: string; name: string; value: number | null; unit: string; available?: boolean }
interface BranchRev { branchName?: string; branchId?: string; revenue: number }
interface Mix { category?: string; treatmentName?: string; count: number; revenue?: number }
interface Trend { date: string; count: number }
interface DocProd { doctorName?: string; doctorId?: string; revenue: number; appointments?: number }

export default function Reports() {
  const [days, setDays] = useState(30);
  const kpis = useQuery({ queryKey: ["reports", "kpis", days], queryFn: () => api.get<Kpi[]>(`/reports/kpis?days=${days}`) });
  const revenue = useQuery({ queryKey: ["reports", "revenue", days], queryFn: () => api.get<BranchRev[]>(`/reports/revenue-by-branch?days=${days}`) });
  const mix = useQuery({ queryKey: ["reports", "mix", days], queryFn: () => api.get<Mix[]>(`/reports/treatment-mix?days=${days}`) });
  const trends = useQuery({ queryKey: ["reports", "trends", days], queryFn: () => api.get<Trend[]>(`/reports/appointment-trends?days=${days}`) });
  const doctors = useQuery({ queryKey: ["reports", "doctors", days], queryFn: () => api.get<DocProd[]>(`/reports/doctor-production?days=${days}`) });

  const kpiList = kpis.data ?? [];
  const totalRevenue = (revenue.data ?? []).reduce((s, r) => s + (r.revenue ?? 0), 0);

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader
        title="Reports & Analytics"
        description={`Live production data — last ${days} days`}
        actions={
          <div className="flex rounded-lg border overflow-hidden">
            {[7, 30, 90].map((n) => (
              <button key={n} onClick={() => setDays(n)} className={`px-3 py-1.5 text-xs font-medium ${days === n ? "bg-emerald-600 text-white" : "bg-white text-slate-500"}`}>{n}D</button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.isLoading
          ? [1, 2, 3, 4].map((i) => <StatCard key={i} title="" value="" loading />)
          : kpiList.slice(0, 4).map((k) => (
              <StatCard key={k.key} title={k.name}
                value={k.available === false || k.value == null ? "N/A" : k.unit === "MYR" ? rm(k.value, 0) : `${k.value}${k.unit === "percent" ? "%" : ""}`}
                icon={<TrendingUp className="h-4 w-4" />} sub={`Last ${days} days`} />
            ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Revenue by Branch — ${rm(totalRevenue, 0)} total`}>
          {revenue.isLoading && <Skeleton className="h-40 w-full" />}
          <div className="divide-y divide-slate-100">
            {(revenue.data ?? []).map((r, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between">
                <p className="text-sm text-slate-700">{r.branchName ?? r.branchId ?? "Branch"}</p>
                <span className="text-sm font-semibold">{rm(r.revenue ?? 0)}</span>
              </div>
            ))}
            {!revenue.isLoading && !(revenue.data ?? []).length && <EmptyState title="No revenue data" />}
          </div>
        </Panel>

        <Panel title="Treatment Mix">
          {mix.isLoading && <Skeleton className="h-40 w-full" />}
          <div className="divide-y divide-slate-100">
            {(mix.data ?? []).slice(0, 15).map((m, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between">
                <p className="text-sm text-slate-700">{m.treatmentName ?? m.category ?? "Treatment"}</p>
                <span className="text-sm font-semibold">{m.count}×</span>
              </div>
            ))}
            {!mix.isLoading && !(mix.data ?? []).length && <EmptyState title="No treatment data" />}
          </div>
        </Panel>

        <Panel title="Appointment Trends">
          {trends.isLoading && <Skeleton className="h-40 w-full" />}
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {(trends.data ?? []).map((t, i) => (
              <div key={i} className="py-2 flex items-center justify-between">
                <p className="text-sm text-slate-700">{t.date}</p>
                <span className="text-sm font-semibold">{t.count} appts</span>
              </div>
            ))}
            {!trends.isLoading && !(trends.data ?? []).length && <EmptyState title="No appointment data" />}
          </div>
        </Panel>

        <Panel title="Doctor Production">
          {doctors.isLoading && <Skeleton className="h-40 w-full" />}
          <div className="divide-y divide-slate-100">
            {(doctors.data ?? []).map((d, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between">
                <p className="text-sm text-slate-700">{d.doctorName ?? d.doctorId ?? "Doctor"}</p>
                <span className="text-sm font-semibold">{rm(d.revenue ?? 0)}</span>
              </div>
            ))}
            {!doctors.isLoading && !(doctors.data ?? []).length && <EmptyState title="No doctor production data" />}
          </div>
        </Panel>
      </div>
    </div>
  );
}
