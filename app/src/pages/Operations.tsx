import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useBranch } from "@/hooks/useBranch";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, StatusBadge, Panel, EmptyState } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate, fmtDateTime, initials } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Building2, Users, CheckSquare, AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";

const roleLabels: Record<string, string> = { hq: "HQ", branch_manager: "Manager", branch_admin: "Reception", doctor: "Doctor" };

export default function Operations() {
  const { branchId } = useBranch();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const overview = trpc.operations.overview.useQuery({ branchId });
  const staff = trpc.operations.staff.useQuery({ branchId });
  const [showTask, setShowTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");

  const addTask = trpc.operations.addTask.useMutation({
    onSuccess: async () => { toast.success("Task added"); await utils.operations.overview.invalidate(); setShowTask(false); setTaskTitle(""); },
    onError: (e) => toast.error(e.message),
  });
  const updateTask = trpc.operations.updateTask.useMutation({
    onSuccess: () => utils.operations.overview.invalidate(),
  });
  const resolveIncident = trpc.operations.resolveIncident.useMutation({
    onSuccess: async () => { toast.success("Incident resolved"); await utils.operations.overview.invalidate(); },
  });

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader title="Operations" description="Branches, staff, chairs, tasks and incidents" />

      <Tabs defaultValue="branches">
        <TabsList className="bg-white border">
          <TabsTrigger value="branches"><Building2 className="h-3.5 w-3.5 mr-1.5" />Branches</TabsTrigger>
          <TabsTrigger value="staff"><Users className="h-3.5 w-3.5 mr-1.5" />Staff & Doctors</TabsTrigger>
          <TabsTrigger value="tasks"><CheckSquare className="h-3.5 w-3.5 mr-1.5" />Tasks</TabsTrigger>
          <TabsTrigger value="incidents"><AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Incident Log</TabsTrigger>
        </TabsList>

        <TabsContent value="branches" className="mt-4">
          {overview.isLoading ? <Skeleton className="h-64 w-full" /> : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(overview.data?.branches ?? []).map((r: any) => (
                <Panel key={r.branch.id}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{r.branch.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{r.branch.address}</p>
                    </div>
                    <span className={`h-2.5 w-2.5 rounded-full mt-1.5 ${r.branch.whatsappConnected ? "bg-emerald-500" : "bg-red-400"}`} title={r.branch.whatsappConnected ? "WhatsApp connected" : "WhatsApp disconnected"} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    {[
                      { l: "Doctors", v: r.doctors }, { l: "Staff", v: r.staff },
                      { l: "Chairs", v: r.chairs }, { l: "Patients", v: r.patients },
                    ].map((s) => (
                      <div key={s.l} className="rounded-lg bg-slate-50 p-2 text-center">
                        <p className="text-base font-bold text-slate-800">{s.v}</p>
                        <p className="text-[10px] text-slate-400">{s.l}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-3 font-mono">{r.branch.code} · WA: {r.branch.whatsappSession}</p>
                </Panel>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="staff" className="mt-4">
          <div className="rounded-xl border bg-white overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Specialization / Title</TableHead>
                <TableHead>Branch</TableHead><TableHead>Contact</TableHead><TableHead>Last Login</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {staff.isLoading
                  ? Array.from({ length: 8 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
                  : (staff.data ?? []).map((u: any) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-7 w-7"><AvatarFallback className="bg-emerald-100 text-emerald-700 text-[10px]">{initials(u.name)}</AvatarFallback></Avatar>
                            <span className="text-sm font-medium">{u.name}</span>
                          </div>
                        </TableCell>
                        <TableCell><span className="text-xs font-medium rounded-full bg-slate-100 px-2 py-0.5">{roleLabels[u.role] ?? u.role}</span></TableCell>
                        <TableCell className="text-xs text-slate-500">{u.specialization ?? u.title ?? "—"}</TableCell>
                        <TableCell className="text-xs text-slate-500">{(u.branchName ?? "HQ").replace("Medini Dental ", "")}</TableCell>
                        <TableCell className="text-xs text-slate-500">{u.email}</TableCell>
                        <TableCell className="text-xs text-slate-400">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never"}</TableCell>
                        <TableCell>{u.isActive ? <StatusBadge status="completed" /> : <StatusBadge status="cancelled" />}</TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowTask(true)}><Plus className="h-4 w-4 mr-1.5" /> New Task</Button>
          </div>
          <Panel>
            <div className="divide-y divide-slate-100">
              {(overview.data?.tasks ?? []).map((r: any) => (
                <div key={r.task.id} className="py-3 flex items-center gap-3">
                  <input type="checkbox" checked={r.task.status === "done"} onChange={() => updateTask.mutate({ id: r.task.id, status: r.task.status === "done" ? "open" : "done" })}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${r.task.status === "done" ? "line-through text-slate-400" : "text-slate-800"}`}>{r.task.title}</p>
                    <p className="text-xs text-slate-400">{(r.branchName ?? "").replace("Medini Dental ", "")}{r.assignee ? ` · ${r.assignee}` : ""}{r.task.dueAt ? ` · due ${fmtDate(r.task.dueAt)}` : ""}</p>
                  </div>
                  <StatusBadge status={r.task.status} />
                </div>
              ))}
              {!overview.data?.tasks?.length && <EmptyState title="No tasks" />}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <Panel>
            <div className="space-y-3">
              {(overview.data?.incidents ?? []).map((r: any) => (
                <div key={r.incident.id} className="rounded-xl border border-slate-200 p-4 flex items-start gap-3">
                  <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${r.incident.severity === "high" ? "text-red-500" : r.incident.severity === "medium" ? "text-amber-500" : "text-slate-400"}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800">{r.incident.title}</p>
                      <StatusBadge status={r.incident.severity} />
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{r.incident.detail}</p>
                    <p className="text-xs text-slate-400 mt-1.5">{(r.branchName ?? "").replace("Medini Dental ", "")} · {fmtDate(r.incident.createdAt)}</p>
                  </div>
                  {r.incident.status === "open" && ["hq", "branch_manager"].includes(user?.role ?? "") && (
                    <Button size="sm" variant="outline" onClick={() => resolveIncident.mutate({ id: r.incident.id })}>Resolve</Button>
                  )}
                  {r.incident.status === "resolved" && <StatusBadge status="resolved" />}
                </div>
              ))}
              {!overview.data?.incidents?.length && <EmptyState title="No incidents logged" />}
            </div>
          </Panel>
        </TabsContent>
      </Tabs>

      <Dialog open={showTask} onOpenChange={setShowTask}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            const bid = branchId ?? user?.branchId;
            if (!bid) return toast.error("Select a branch first (top-right branch switcher)");
            addTask.mutate({ branchId: bid, title: taskTitle, dueAt: taskDue ? new Date(taskDue) : undefined });
          }}>
            <div className="space-y-1.5"><Label>Task *</Label><Input required value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Due date</Label><Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowTask(false)}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={addTask.isPending}>Add Task</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
