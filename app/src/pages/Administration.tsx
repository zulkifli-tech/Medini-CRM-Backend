import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Panel, EmptyState, StatusBadge } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { rm, fmtDateTime, initials } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ShieldCheck, Users, ScrollText, Database, Building2, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";

const roleLabels: Record<string, string> = { hq: "HQ Super Admin", branch_manager: "Branch Manager", branch_admin: "Branch Admin", doctor: "Doctor" };
const roleColors: Record<string, string> = { hq: "bg-emerald-100 text-emerald-700", branch_manager: "bg-blue-100 text-blue-700", branch_admin: "bg-amber-100 text-amber-700", doctor: "bg-violet-100 text-violet-700" };

function PermissionsMatrix() {
  const matrix = trpc.admin.matrix.useQuery();
  if (matrix.isLoading) return <Skeleton className="h-96 w-full" />;
  if (!matrix.data) return <EmptyState title="Unable to load matrix" />;
  const { matrix: m, modules, roles } = matrix.data;
  const actions = ["view", "create", "edit", "delete", "approve", "export", "print", "assign"];
  return (
    <div className="rounded-xl border bg-white overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="sticky left-0 bg-slate-50">Module</TableHead>
            <TableHead>Action</TableHead>
            {roles.map((r: string) => <TableHead key={r} className="text-center"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleColors[r]}`}>{roleLabels[r]}</span></TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {modules.map((mod: string) =>
            actions.map((act, ai) => {
              const allowed = (m as any)[mod]?.[act] ?? [];
              if (!allowed.length && act !== "view") return null;
              return (
                <TableRow key={`${mod}-${act}`}>
                  {ai === 0 && <TableCell rowSpan={allowed.filter((x: string[]) => x.length).length + (m as any)[mod].view.length ? actions.filter((a) => a === "view" || (m as any)[mod][a]?.length).length : 1} className="font-semibold capitalize sticky left-0 bg-white border-r">{mod}</TableCell>}
                  <TableCell className="text-xs capitalize text-slate-500">{act}</TableCell>
                  {roles.map((r: string) => (
                    <TableCell key={r} className="text-center">
                      {allowed.includes(r) ? <Check className="h-4 w-4 text-emerald-500 mx-auto" /> : <X className="h-3.5 w-3.5 text-slate-200 mx-auto" />}
                    </TableCell>
                  ))}
                </TableRow>
              );
            }),
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function NewUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const branches = trpc.meta.branches.useQuery();
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "doctor", branchId: "", email: "", title: "", specialization: "" });
  const create = trpc.admin.createUser.useMutation({
    onSuccess: async () => { toast.success("User created"); await utils.admin.users.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create User</DialogTitle><DialogDescription>Assign a role — menus and permissions follow automatically.</DialogDescription></DialogHeader>
        <form className="grid grid-cols-2 gap-3" onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            name: form.name, username: form.username, password: form.password, role: form.role as any,
            branchId: form.branchId ? Number(form.branchId) : undefined, email: form.email || undefined,
            title: form.title || undefined, specialization: form.specialization || undefined,
          });
        }}>
          <div className="col-span-2 space-y-1.5"><Label>Full Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Username *</Label><Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Password *</Label><Input required type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Role *</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(roleLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.role !== "hq" && (
            <div className="space-y-1.5">
              <Label>Branch *</Label>
              <Select value={form.branchId} onValueChange={(v) => setForm({ ...form, branchId: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{(branches.data ?? []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2 space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          {form.role === "doctor" && <div className="col-span-2 space-y-1.5"><Label>Specialization</Label><Input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} /></div>}
          <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={create.isPending}>Create User</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Administration() {
  const utils = trpc.useUtils();
  const users = trpc.admin.users.useQuery();
  const logs = trpc.admin.auditLogs.useQuery({});
  const master = trpc.admin.masterData.useQuery();
  const [showUser, setShowUser] = useState(false);
  const [showBranch, setShowBranch] = useState(false);
  const [branchForm, setBranchForm] = useState({ code: "", name: "", city: "" });

  const toggleUser = trpc.admin.toggleUser.useMutation({
    onSuccess: async () => { toast.success("User updated"); await utils.admin.users.invalidate(); },
  });
  const addBranch = trpc.admin.addBranch.useMutation({
    onSuccess: async () => { toast.success("Branch added"); await utils.admin.masterData.invalidate(); setShowBranch(false); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader title="Administration" description="Users, roles, master data and audit trail — HQ only" />

      <Tabs defaultValue="users">
        <TabsList className="bg-white border">
          <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1.5" />Users</TabsTrigger>
          <TabsTrigger value="permissions"><ShieldCheck className="h-3.5 w-3.5 mr-1.5" />Roles & Permissions</TabsTrigger>
          <TabsTrigger value="master"><Database className="h-3.5 w-3.5 mr-1.5" />Master Data</TabsTrigger>
          <TabsTrigger value="audit"><ScrollText className="h-3.5 w-3.5 mr-1.5" />Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="flex justify-end"><Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowUser(true)}><Plus className="h-4 w-4 mr-1.5" /> New User</Button></div>
          <div className="rounded-xl border bg-white overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead>User</TableHead><TableHead>Username</TableHead><TableHead>Role</TableHead>
                <TableHead>Branch</TableHead><TableHead>Last Login</TableHead><TableHead>Active</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {users.isLoading
                  ? Array.from({ length: 8 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
                  : (users.data ?? []).map((u: any) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-7 w-7"><AvatarFallback className="bg-emerald-100 text-emerald-700 text-[10px]">{initials(u.name)}</AvatarFallback></Avatar>
                            <div><p className="text-sm font-medium">{u.name}</p><p className="text-xs text-slate-400">{u.email}</p></div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{u.username}</TableCell>
                        <TableCell><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleColors[u.role]}`}>{roleLabels[u.role]}</span></TableCell>
                        <TableCell className="text-xs text-slate-500">{(u.branchName ?? "HQ").replace("Medini Dental ", "")}</TableCell>
                        <TableCell className="text-xs text-slate-400">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "—"}</TableCell>
                        <TableCell><Switch checked={u.isActive} onCheckedChange={(v) => toggleUser.mutate({ id: u.id, isActive: v })} /></TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <PermissionsMatrix />
        </TabsContent>

        <TabsContent value="master" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Branches" subtitle={`${master.data?.branches?.length ?? 0} locations`}
              action={<Button size="sm" variant="outline" onClick={() => setShowBranch(true)}><Building2 className="h-4 w-4 mr-1.5" /> Add</Button>}>
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {(master.data?.branches ?? []).map((b: any) => (
                  <div key={b.id} className="py-2.5 flex items-center justify-between">
                    <div><p className="text-sm font-medium text-slate-800">{b.name}</p><p className="text-xs text-slate-400">{b.city} · {b.code}</p></div>
                    {b.isActive ? <StatusBadge status="completed" /> : <StatusBadge status="cancelled" />}
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Treatment Catalogue">
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {(master.data?.treatments ?? []).map((t: any) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between">
                    <div><p className="text-sm font-medium text-slate-800">{t.name}</p><p className="text-xs text-slate-400">{t.code} · {t.category} · {t.durationMin} min</p></div>
                    <span className="text-sm font-semibold text-emerald-600">{rm(t.price, 0)}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Insurance Panels">
              <div className="divide-y divide-slate-100">
                {(master.data?.panels ?? []).map((p: any) => (
                  <div key={p.id} className="py-2.5">
                    <p className="text-sm font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.contactEmail} · {p.contactPhone}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Panel>
            <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
              {(logs.data ?? []).map((r: any) => (
                <div key={r.log.id} className="py-2.5 flex items-center gap-3 text-sm">
                  <ScrollText className="h-4 w-4 text-slate-300 shrink-0" />
                  <span className="font-medium text-slate-700 w-32 truncate">{r.userName ?? "System"}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{r.log.module}</span>
                  <span className="text-slate-600">{r.log.action}</span>
                  <span className="text-xs text-slate-400 truncate flex-1">{r.log.detail ?? ""}</span>
                  <span className="text-xs text-slate-400 shrink-0">{r.branchName ? r.branchName.replace("Medini Dental ", "") : "HQ"} · {fmtDateTime(r.log.createdAt)}</span>
                </div>
              ))}
              {!logs.data?.length && <EmptyState title="No audit events yet" />}
            </div>
          </Panel>
        </TabsContent>
      </Tabs>

      <NewUserDialog open={showUser} onClose={() => setShowUser(false)} />

      <Dialog open={showBranch} onOpenChange={setShowBranch}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Branch</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); addBranch.mutate(branchForm); }}>
            <div className="space-y-1.5"><Label>Code *</Label><Input required value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })} placeholder="e.g. KCH" /></div>
            <div className="space-y-1.5"><Label>Name *</Label><Input required value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} placeholder="e.g. Medini Dental Kuching" /></div>
            <div className="space-y-1.5"><Label>City *</Label><Input required value={branchForm.city} onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })} /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowBranch(false)}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={addBranch.isPending}>Add Branch</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
