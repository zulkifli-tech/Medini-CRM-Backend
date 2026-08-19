import { PageHeader, Panel, EmptyState } from "@/components/shared";


/**
 * S10 T1: WhatsApp Hub is a secondary module not in the core T1 scope
 * (Login/User Management/Dashboard/Patients/Appointments/Clinical/Finance/Reports/Profile).
 * Its production backend wiring is a post-T1 task. The tRPC prototype data
 * layer has been removed; this placeholder preserves the route + navigation.
 */
export default function WhatsAppHub() {
  return (
    <div className="space-y-5 -mt-6">
      <PageHeader title="WhatsApp Hub" description="Post-T1 module — production wiring pending" />
      <Panel>
        <EmptyState
          title="WhatsApp Hub — not yet wired to production backend"
          description="This module's production REST integration is scheduled for a later S10 task. Core T1 modules (Patients, Appointments, Clinical, Finance, Reports, Dashboard, User Management) are live."
        />
      </Panel>
    </div>
  );
}
