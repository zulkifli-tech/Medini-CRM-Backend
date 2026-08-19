import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, Panel, EmptyState, StatusBadge } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/format";
import { Stethoscope, Pill, AlertTriangle, Share2 } from "lucide-react";

interface Treatment { id: string; name?: string; status: string; createdAt?: string }
interface Prescription { id: string; medication?: string; status?: string; createdAt?: string }
interface AdverseEvent { id: string; description?: string; createdAt?: string }
interface Referral { id: string; status: string; createdAt?: string }

function useClinical<T>(key: string, path: string) {
  return useQuery({ queryKey: ["clinical", key], queryFn: () => api.get<T[]>(path) });
}

export default function Clinical() {
  const treatments = useClinical<Treatment>("treatments", "/clinical/treatments");
  const prescriptions = useClinical<Prescription>("prescriptions", "/clinical/prescriptions");
  const adverse = useClinical<AdverseEvent>("adverse", "/clinical/adverse-events");
  const referrals = useClinical<Referral>("referrals", "/clinical/referrals");

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader title="Clinical" description="Treatments, prescriptions, adverse events, referrals" />
      <Tabs defaultValue="treatments">
        <TabsList className="bg-white border">
          <TabsTrigger value="treatments"><Stethoscope className="h-3.5 w-3.5 mr-1.5" />Treatments</TabsTrigger>
          <TabsTrigger value="prescriptions"><Pill className="h-3.5 w-3.5 mr-1.5" />Prescriptions</TabsTrigger>
          <TabsTrigger value="adverse"><AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Adverse Events</TabsTrigger>
          <TabsTrigger value="referrals"><Share2 className="h-3.5 w-3.5 mr-1.5" />Referrals</TabsTrigger>
        </TabsList>

        <TabsContent value="treatments" className="mt-4">
          <Panel>
            {treatments.isLoading && <Skeleton className="h-40 w-full" />}
            <div className="divide-y divide-slate-100">
              {(treatments.data ?? []).map((t) => (
                <div key={t.id} className="py-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">{t.name ?? "Treatment"}</p>
                  <StatusBadge status={t.status} />
                </div>
              ))}
              {!treatments.isLoading && !(treatments.data ?? []).length && <EmptyState title="No treatments" />}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="prescriptions" className="mt-4">
          <Panel>
            {prescriptions.isLoading && <Skeleton className="h-40 w-full" />}
            <div className="divide-y divide-slate-100">
              {(prescriptions.data ?? []).map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">{r.medication ?? "Prescription"}</p>
                  <span className="text-xs text-slate-400">{fmtDate(r.createdAt)}</span>
                </div>
              ))}
              {!prescriptions.isLoading && !(prescriptions.data ?? []).length && <EmptyState title="No prescriptions" />}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="adverse" className="mt-4">
          <Panel>
            {adverse.isLoading && <Skeleton className="h-40 w-full" />}
            <div className="divide-y divide-slate-100">
              {(adverse.data ?? []).map((a) => (
                <div key={a.id} className="py-3">
                  <p className="text-sm text-slate-700">{a.description ?? "Adverse event"}</p>
                  <p className="text-xs text-slate-400">{fmtDate(a.createdAt)}</p>
                </div>
              ))}
              {!adverse.isLoading && !(adverse.data ?? []).length && <EmptyState title="No adverse events" />}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="referrals" className="mt-4">
          <Panel>
            {referrals.isLoading && <Skeleton className="h-40 w-full" />}
            <div className="divide-y divide-slate-100">
              {(referrals.data ?? []).map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">Referral</p>
                  <StatusBadge status={r.status} />
                </div>
              ))}
              {!referrals.isLoading && !(referrals.data ?? []).length && <EmptyState title="No referrals" />}
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
