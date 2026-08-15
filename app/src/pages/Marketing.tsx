import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useBranch } from "@/hooks/useBranch";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, StatusBadge, Panel, EmptyState, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate } from "@/lib/format";
import { Megaphone, Plus, Send, Users, MessageSquare, Cake, Star, Tag, BellRing } from "lucide-react";
import { toast } from "sonner";

const typeIcons: Record<string, any> = { broadcast: Megaphone, recall: BellRing, birthday: Cake, promotion: Tag, review: Star };

export default function Marketing() {
  const { branchId } = useBranch();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const campaigns = trpc.marketing.campaigns.useQuery({ branchId });
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", type: "broadcast", segment: "", message: "", branchId: "" });

  const create = trpc.marketing.createCampaign.useMutation({
    onSuccess: async () => { toast.success("Campaign created"); await utils.marketing.campaigns.invalidate(); setShowNew(false); },
    onError: (e) => toast.error(e.message),
  });

  const rows = campaigns.data ?? [];
  const totals = {
    sent: rows.reduce((s: number, r: any) => s + r.campaign.sentCount, 0),
    responded: rows.reduce((s: number, r: any) => s + r.campaign.respondedCount, 0),
    running: rows.filter((r: any) => r.campaign.status === "running").length,
  };

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader
        title="Marketing"
        description="WhatsApp campaigns, broadcasts, recalls and promotions"
        actions={user?.role === "hq" && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1.5" /> New Campaign</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Messages Sent" value={totals.sent.toLocaleString()} icon={<Send className="h-4 w-4" />} loading={campaigns.isLoading} />
        <StatCard title="Responses" value={totals.responded.toLocaleString()} icon={<MessageSquare className="h-4 w-4" />} sub={totals.sent ? `${Math.round((totals.responded / totals.sent) * 100)}% response rate` : undefined} loading={campaigns.isLoading} />
        <StatCard title="Running Campaigns" value={totals.running} icon={<Megaphone className="h-4 w-4" />} loading={campaigns.isLoading} />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((r: any) => {
          const c = r.campaign;
          const Icon = typeIcons[c.type] ?? Megaphone;
          const rate = c.sentCount ? Math.round((c.respondedCount / c.sentCount) * 100) : 0;
          return (
            <Panel key={c.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-emerald-50 p-2.5"><Icon className="h-5 w-5 text-emerald-600" /></div>
                  <div>
                    <p className="font-semibold text-slate-800 leading-tight">{c.name}</p>
                    <p className="text-xs text-slate-400 capitalize mt-0.5">{c.type} · {r.branchName ? r.branchName.replace("Medini Dental ", "") : "All branches"}</p>
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </div>
              {c.message && <p className="text-sm text-slate-500 mt-3 line-clamp-2 bg-slate-50 rounded-lg p-2.5">{c.message}</p>}
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>{c.sentCount.toLocaleString()} sent · {c.deliveredCount.toLocaleString()} delivered</span>
                  <span className="font-semibold text-emerald-600">{rate}% responded</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, rate)}%` }} />
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2.5 flex items-center gap-1"><Users className="h-3 w-3" /> {c.segment ?? "All patients"} · {fmtDate(c.scheduledAt)}</p>
            </Panel>
          );
        })}
        {!campaigns.isLoading && !rows.length && <Panel className="md:col-span-2 xl:col-span-3"><EmptyState title="No campaigns yet" /></Panel>}
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Campaign</DialogTitle><DialogDescription>Create a WhatsApp campaign for a patient segment.</DialogDescription></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ name: form.name, type: form.type as any, segment: form.segment || undefined, message: form.message, branchId: form.branchId ? Number(form.branchId) : undefined });
          }}>
            <div className="space-y-1.5"><Label>Campaign Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="broadcast">Broadcast</SelectItem><SelectItem value="recall">Recall</SelectItem>
                    <SelectItem value="birthday">Birthday</SelectItem><SelectItem value="promotion">Promotion</SelectItem>
                    <SelectItem value="review">Review Request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Segment</Label><Input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} placeholder="e.g. Recall due ≤ 14 days" /></div>
            </div>
            <div className="space-y-1.5"><Label>Message *</Label><Textarea required minLength={10} rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="WhatsApp message body…" /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={create.isPending}>Create Campaign</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
