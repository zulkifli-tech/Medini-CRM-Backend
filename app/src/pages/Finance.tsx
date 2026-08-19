import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, StatCard, Panel, EmptyState, StatusBadge } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { rm, fmtDate } from "@/lib/format";
import { TrendingUp, Receipt, AlertCircle } from "lucide-react";

interface Revenue { total?: number; amount?: number }
interface Sale { id: string; amount?: number; status?: string; saleDate?: string }
interface Alert { id: string; message?: string; severity?: string }

export default function Finance() {
  const revenue = useQuery({ queryKey: ["finance", "revenue"], queryFn: () => api.get<Revenue>("/finance/revenue") });
  const sales = useQuery({ queryKey: ["finance", "sales"], queryFn: () => api.get<Sale[]>("/finance/sales") });
  const alerts = useQuery({ queryKey: ["finance", "alerts"], queryFn: () => api.get<Alert[]>("/finance/alerts") });

  const totalRevenue = revenue.data?.total ?? revenue.data?.amount ?? 0;
  const salesRows = sales.data ?? [];

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader title="Finance" description="Revenue, sales and finance alerts (status-layer only — no payment gateway)" />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total Revenue" value={rm(totalRevenue, 0)} icon={<TrendingUp className="h-4 w-4" />} loading={revenue.isLoading} />
        <StatCard title="Sales Records" value={salesRows.length} icon={<Receipt className="h-4 w-4" />} loading={sales.isLoading} />
        <StatCard title="Active Alerts" value={(alerts.data ?? []).length} icon={<AlertCircle className="h-4 w-4" />} loading={alerts.isLoading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recent Sales">
          {sales.isLoading && <Skeleton className="h-40 w-full" />}
          <div className="divide-y divide-slate-100">
            {salesRows.slice(0, 20).map((s) => (
              <div key={s.id} className="py-2.5 flex items-center justify-between">
                <p className="text-sm text-slate-700">{fmtDate(s.saleDate)}</p>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{rm(s.amount ?? 0)}</span>
                  <StatusBadge status={s.status ?? "pending"} />
                </div>
              </div>
            ))}
            {!sales.isLoading && !salesRows.length && <EmptyState title="No sales records" />}
          </div>
        </Panel>

        <Panel title="Finance Alerts">
          {alerts.isLoading && <Skeleton className="h-40 w-full" />}
          <div className="divide-y divide-slate-100">
            {(alerts.data ?? []).slice(0, 20).map((a) => (
              <div key={a.id} className="py-2.5">
                <p className="text-sm text-slate-700">{a.message ?? "Alert"}</p>
                <p className="text-xs text-slate-400 capitalize">{a.severity ?? "info"}</p>
              </div>
            ))}
            {!alerts.isLoading && !(alerts.data ?? []).length && <EmptyState title="No active alerts" />}
          </div>
        </Panel>
      </div>
    </div>
  );
}
