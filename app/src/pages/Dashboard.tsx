import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, StatCard, Panel, EmptyState } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { rm } from "@/lib/format";
import { Users, CalendarDays, TrendingUp, Stethoscope } from "lucide-react";

/* S10 T1: dashboard uses only backend-supported context data (no mock insights). */
interface DashboardContext {
  todayAppointments?: number;
  totalPatients?: number;
  revenue?: number;
  activeStaff?: number;
  [k: string]: unknown;
}

export default function Dashboard() {
  const { user } = useAuth();
  const context = useQuery({ queryKey: ["dashboard", "context"], queryFn: () => api.get<DashboardContext>("/dashboard/context") });

  const d = context.data ?? {};

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader
        title={`Welcome${user?.name ? `, ${user.name}` : ""}`}
        description={`${user?.role?.replace(/_/g, " ") ?? ""} · Medini CRM production dashboard`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Today's Appointments" value={d.todayAppointments ?? "—"} icon={<CalendarDays className="h-4 w-4" />} loading={context.isLoading} />
        <StatCard title="Total Patients" value={d.totalPatients ?? "—"} icon={<Users className="h-4 w-4" />} loading={context.isLoading} />
        <StatCard title="Revenue" value={d.revenue != null ? rm(d.revenue, 0) : "—"} icon={<TrendingUp className="h-4 w-4" />} loading={context.isLoading} />
        <StatCard title="Active Staff" value={d.activeStaff ?? "—"} icon={<Stethoscope className="h-4 w-4" />} loading={context.isLoading} />
      </div>

      <Panel title="Dashboard Context">
        {context.isLoading && <Skeleton className="h-32 w-full" />}
        {!context.isLoading && !context.data && (
          <EmptyState title="No dashboard data" description="The backend dashboard context returned no data for your scope." />
        )}
        {context.data && (
          <pre className="text-xs text-slate-600 bg-slate-50 rounded-lg p-4 overflow-x-auto">{JSON.stringify(context.data, null, 2)}</pre>
        )}
      </Panel>
    </div>
  );
}
