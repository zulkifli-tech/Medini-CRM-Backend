import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useBranch } from "@/hooks/useBranch";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, StatCard, Panel, StatusBadge, EmptyState } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/format";
import {
  Bot, PhoneIncoming, CalendarCheck, HeartHandshake, BellRing, Wallet,
  Megaphone, Star, BarChart3, AlertTriangle, Info, CheckCircle2, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const agentMeta: Record<string, { label: string; icon: any; desc: string; color: string }> = {
  receptionist: { label: "AI Receptionist", icon: PhoneIncoming, desc: "Answers enquiries 24/7 on WhatsApp", color: "bg-emerald-500" },
  booking: { label: "AI Booking Manager", icon: CalendarCheck, desc: "Finds slots, books & reschedules", color: "bg-blue-500" },
  followup: { label: "AI Follow-up", icon: HeartHandshake, desc: "Post-treatment check-ins", color: "bg-violet-500" },
  recall: { label: "AI Recall", icon: BellRing, desc: "6-month hygiene recalls", color: "bg-amber-500" },
  payment_reminder: { label: "AI Payment Reminder", icon: Wallet, desc: "Polite outstanding-balance nudges", color: "bg-rose-500" },
  campaign: { label: "AI Campaign Manager", icon: Megaphone, desc: "Drafts & schedules campaigns", color: "bg-cyan-500" },
  review: { label: "AI Review Manager", icon: Star, desc: "Google review requests", color: "bg-yellow-500" },
  analyst: { label: "AI Business Analyst", icon: BarChart3, desc: "Insights from your data", color: "bg-indigo-500" },
};

const severityIcon = { info: Info, warning: AlertTriangle, success: CheckCircle2 };
const severityColor = { info: "text-blue-500 bg-blue-50", warning: "text-amber-600 bg-amber-50", success: "text-emerald-600 bg-emerald-50" };

export default function AIManager() {
  const { branchId } = useBranch();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const overview = trpc.ai.overview.useQuery({ branchId });
  const logs = trpc.ai.logs.useQuery({ branchId });
  const prompts = trpc.ai.prompts.useQuery();
  const knowledge = trpc.ai.knowledge.useQuery();
  const insights = trpc.ai.insights.useQuery({ branchId });
  const [editPrompt, setEditPrompt] = useState<any | null>(null);
  const [promptText, setPromptText] = useState("");
  const [showKb, setShowKb] = useState(false);
  const [kbForm, setKbForm] = useState({ category: "", question: "", answer: "" });

  const canEdit = user?.role === "hq";
  const updatePrompt = trpc.ai.updatePrompt.useMutation({
    onSuccess: async () => { toast.success("Prompt updated"); await utils.ai.prompts.invalidate(); setEditPrompt(null); },
    onError: (e) => toast.error(e.message),
  });
  const addKb = trpc.ai.addKnowledge.useMutation({
    onSuccess: async () => { toast.success("Knowledge added"); await utils.ai.knowledge.invalidate(); setShowKb(false); },
    onError: (e) => toast.error(e.message),
  });
  const toggleKb = trpc.ai.toggleKnowledge.useMutation({ onSuccess: () => utils.ai.knowledge.invalidate() });

  const o = overview.data;
  const agentCounts = Object.fromEntries((o?.byAgent ?? []).map((a) => [a.name, a.value]));

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader title="AI Manager" description="Your 8 AI employees — digital staff, not chatbots" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="AI Actions (7d)" value={o?.total7d?.toLocaleString() ?? "…"} icon={<Bot className="h-4 w-4" />} loading={overview.isLoading} />
        <StatCard title="Avg Confidence" value={o ? `${Math.round(o.avgConfidence * 100)}%` : "…"} icon={<CheckCircle2 className="h-4 w-4" />} loading={overview.isLoading} />
        <StatCard title="Escalated to Human" value={o?.escalated7d ?? "…"} icon={<AlertTriangle className="h-4 w-4" />} sub={o && o.total7d ? `${Math.round((o.escalated7d / Math.max(1, o.total7d)) * 100)}% of actions` : undefined} loading={overview.isLoading} />
        <StatCard title="Active Agents" value="8 / 8" icon={<PhoneIncoming className="h-4 w-4" />} sub="All systems operational" />
      </div>

      {/* Agent cards */}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Object.entries(agentMeta).map(([key, meta]) => (
          <Panel key={key}>
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-2.5 text-white ${meta.color}`}><meta.icon className="h-5 w-5" /></div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800 text-sm">{meta.label}</p>
                <p className="text-xs text-slate-400">{meta.desc}</p>
              </div>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Active" />
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-xs text-slate-500">Actions (7d)</span>
              <span className="text-sm font-bold text-slate-800">{agentCounts[key] ?? 0}</span>
            </div>
          </Panel>
        ))}
      </div>

      <Tabs defaultValue="insights">
        <TabsList className="bg-white border">
          <TabsTrigger value="insights"><BarChart3 className="h-3.5 w-3.5 mr-1.5" />Business Insights</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="logs">AI Logs</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="mt-4">
          <div className="space-y-3">
            {(insights.data ?? []).map((ins, i) => {
              const Icon = severityIcon[ins.severity];
              return (
                <Panel key={i}>
                  <div className="flex gap-3">
                    <div className={`rounded-lg p-2 h-fit ${severityColor[ins.severity]}`}><Icon className="h-5 w-5" /></div>
                    <div>
                      <p className="font-semibold text-slate-800">{ins.title}</p>
                      <p className="text-sm text-slate-500 mt-1 leading-relaxed">{ins.body}</p>
                    </div>
                  </div>
                </Panel>
              );
            })}
            {insights.isLoading && <Skeleton className="h-40 w-full" />}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Panel title="AI Activity" subtitle="Actions per day, last 7 days">
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={o?.byDay ?? []} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs><linearGradient id="gAi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d9d6c" stopOpacity={0.3} /><stop offset="100%" stopColor="#0d9d6c" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#0d9d6c" strokeWidth={2} fill="url(#gAi)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Panel>
            <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
              {(logs.data ?? []).map((r: any) => (
                <div key={r.log.id} className="py-3 flex items-start gap-3">
                  <div className={`rounded-lg p-1.5 mt-0.5 ${r.log.escalated ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}>
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{r.log.action}</span>
                      <span className="text-[10px] font-medium rounded-full bg-slate-100 px-2 py-0.5 capitalize text-slate-500">{r.log.agent.replace("_", " ")}</span>
                      {r.log.escalated && <StatusBadge status="human_takeover" className="!text-[9px]" />}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{r.log.detail}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-bold ${Number(r.log.confidence) >= 0.8 ? "text-emerald-600" : Number(r.log.confidence) >= 0.6 ? "text-amber-600" : "text-red-500"}`}>
                      {Math.round(Number(r.log.confidence ?? 0) * 100)}%
                    </p>
                    <p className="text-[10px] text-slate-400">{timeAgo(r.log.createdAt)}</p>
                  </div>
                </div>
              ))}
              {!logs.data?.length && <EmptyState title="No AI logs yet" />}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="prompts" className="mt-4">
          <div className="space-y-3">
            {(prompts.data ?? []).map((p: any) => (
              <Panel key={p.id} title={p.name} subtitle={`Agent: ${p.agent.replace("_", " ")}`}>
                <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{p.prompt}</p>
                {canEdit && (
                  <div className="flex justify-end mt-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditPrompt(p); setPromptText(p.prompt); }}>Edit Prompt</Button>
                  </div>
                )}
              </Panel>
            ))}
            {!canEdit && <p className="text-xs text-slate-400">Only HQ can edit AI prompts.</p>}
          </div>
        </TabsContent>

        <TabsContent value="knowledge" className="mt-4 space-y-3">
          {canEdit && <div className="flex justify-end"><Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowKb(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Knowledge</Button></div>}
          <div className="grid md:grid-cols-2 gap-3">
            {(knowledge.data ?? []).map((k: any) => (
              <Panel key={k.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">{k.category}</span>
                    <p className="font-semibold text-slate-800 text-sm mt-1">{k.question}</p>
                    <p className="text-sm text-slate-500 mt-1.5">{k.answer}</p>
                  </div>
                  {canEdit && <Switch checked={k.isActive} onCheckedChange={(v) => toggleKb.mutate({ id: k.id, isActive: v })} />}
                </div>
              </Panel>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editPrompt} onOpenChange={() => setEditPrompt(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit Prompt — {editPrompt?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea rows={8} value={promptText} onChange={(e) => setPromptText(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditPrompt(null)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={updatePrompt.isPending}
                onClick={() => updatePrompt.mutate({ id: editPrompt.id, prompt: promptText })}>Save Prompt</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showKb} onOpenChange={setShowKb}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Knowledge</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); addKb.mutate(kbForm); }}>
            <div className="space-y-1.5"><Label>Category *</Label><Input required value={kbForm.category} onChange={(e) => setKbForm({ ...kbForm, category: e.target.value })} placeholder="e.g. Pricing" /></div>
            <div className="space-y-1.5"><Label>Question *</Label><Input required value={kbForm.question} onChange={(e) => setKbForm({ ...kbForm, question: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Answer *</Label><Textarea required rows={4} value={kbForm.answer} onChange={(e) => setKbForm({ ...kbForm, answer: e.target.value })} /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowKb(false)}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={addKb.isPending}>Save</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
