import { useEffect, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useBranch } from "@/hooks/useBranch";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { initials, timeAgo, fmtTime } from "@/lib/format";
import { MessageSquare, Send, Bot, UserCheck, Phone, Check, CheckCheck, Smartphone, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function WhatsAppHub() {
  const { branchId } = useBranch();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const sessions = trpc.whatsapp.sessions.useQuery(undefined, { refetchInterval: 30000 });
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);
  const [activeConv, setActiveConv] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [simulate, setSimulate] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scopedBranch = user?.role === "hq" ? (selectedBranch ?? branchId) : user?.branchId;
  const convs = trpc.whatsapp.conversations.useQuery({ branchId: scopedBranch ?? undefined }, { refetchInterval: 15000 });
  const msgs = trpc.whatsapp.messages.useQuery({ conversationId: activeConv! }, { enabled: !!activeConv, refetchInterval: 8000 });

  const conv = (convs.data ?? []).find((c: any) => c.conv.id === activeConv);
  const humanMode = conv?.conv.status === "human_takeover";

  const sendStaff = trpc.whatsapp.sendStaffMessage.useMutation({
    onSuccess: async () => { setDraft(""); await utils.whatsapp.messages.invalidate(); await utils.whatsapp.conversations.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const simulateInbound = trpc.whatsapp.simulateInbound.useMutation({
    onSuccess: async (r) => {
      setDraft("");
      await utils.whatsapp.messages.invalidate();
      await utils.whatsapp.conversations.invalidate();
      await utils.ai.logs.invalidate();
      if (r.aiReplied && r.escalated) toast.warning("AI confidence low — conversation escalated to human takeover");
      else if (r.aiReplied) toast.success(`AI replied (confidence ${Math.round((r.confidence ?? 0) * 100)}%)`);
    },
    onError: (e) => toast.error(e.message),
  });
  const toggleTakeover = trpc.whatsapp.toggleTakeover.useMutation({
    onSuccess: async () => { await utils.whatsapp.conversations.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.data]);

  const send = () => {
    if (!draft.trim() || !activeConv) return;
    if (simulate) simulateInbound.mutate({ conversationId: activeConv, body: draft.trim() });
    else sendStaff.mutate({ conversationId: activeConv, body: draft.trim() });
  };

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader title="WhatsApp Hub" description="14 WAHA sessions — one per branch · AI receptionist with human takeover" />

      {/* Sessions strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(sessions.data ?? []).map((r: any) => {
          const active = scopedBranch === r.branch.id;
          return (
            <button key={r.branch.id} onClick={() => { setSelectedBranch(r.branch.id); setActiveConv(null); }}
              className={cn("shrink-0 rounded-xl border px-3.5 py-2.5 text-left transition min-w-[150px]",
                active ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-emerald-300")}>
              <div className="flex items-center gap-2">
                <Smartphone className={cn("h-3.5 w-3.5", r.branch.whatsappConnected ? "text-emerald-500" : "text-red-400")} />
                <span className="text-xs font-semibold text-slate-800 truncate">{r.branch.name.replace("Medini Dental ", "")}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={cn("h-1.5 w-1.5 rounded-full", r.branch.whatsappConnected ? "bg-emerald-500" : "bg-red-400")} />
                <span className="text-[10px] text-slate-400">{r.branch.whatsappConnected ? "Connected" : "Disconnected"} · {r.open} open</span>
                {Number(r.unread) > 0 && <span className="ml-auto rounded-full bg-emerald-500 px-1.5 text-[9px] font-bold text-white">{r.unread}</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-320px)] min-h-[480px]">
        {/* Conversations list */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Inbox</p>
            <span className="text-xs text-slate-400">{convs.data?.length ?? 0} conversations</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convs.isLoading ? (
              <div className="p-3 space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : (convs.data ?? []).map((c: any) => (
              <button key={c.conv.id} onClick={() => setActiveConv(c.conv.id)}
                className={cn("w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-emerald-50/50 transition flex gap-3",
                  activeConv === c.conv.id && "bg-emerald-50 border-l-2 border-l-emerald-500")}>
                <Avatar className="h-9 w-9 shrink-0"><AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">{initials(c.conv.contactName)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.conv.contactName}</p>
                    <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(c.conv.lastMessageAt)}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{c.lastMessage}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <StatusBadge status={c.conv.status} className="!px-1.5 !py-0 !text-[9px]" />
                    {c.conv.unreadCount > 0 && <span className="rounded-full bg-emerald-500 px-1.5 text-[9px] font-bold text-white">{c.conv.unreadCount}</span>}
                  </div>
                </div>
              </button>
            ))}
            {!convs.isLoading && !convs.data?.length && <EmptyState title="No conversations" description="Select a branch with active WhatsApp sessions." />}
          </div>
        </div>

        {/* Chat thread */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
          {!conv ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState title="Select a conversation" icon={<MessageSquare className="h-6 w-6" />} description="Pick a conversation from the inbox to view the thread." />
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                <Avatar className="h-9 w-9"><AvatarFallback className="bg-emerald-600 text-white text-xs">{initials(conv.conv.contactName)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{conv.conv.contactName}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1"><Phone className="h-3 w-3" /> {conv.conv.phone} · {(conv.branchName ?? "").replace("Medini Dental ", "")}</p>
                </div>
                <StatusBadge status={conv.conv.status} />
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
                  {humanMode ? <UserCheck className="h-4 w-4 text-amber-500" /> : <Bot className="h-4 w-4 text-emerald-500" />}
                  <span className="text-xs font-medium text-slate-600">{humanMode ? "Human" : "AI"}</span>
                  <Switch checked={humanMode} onCheckedChange={(v) => toggleTakeover.mutate({ conversationId: conv.conv.id, human: v })} />
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f0f4f1]" style={{ backgroundImage: "radial-gradient(#d1e7da 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
                {(msgs.data ?? []).map((m: any) => {
                  const inbound = m.direction === "inbound";
                  return (
                    <div key={m.id} className={cn("flex", inbound ? "justify-start" : "justify-end")}>
                      <div className={cn("max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-sm",
                        inbound ? "bg-white rounded-tl-sm" : m.sender === "ai" ? "bg-emerald-600 text-white rounded-tr-sm" : "bg-emerald-100 text-slate-800 rounded-tr-sm")}>
                        {!inbound && (
                          <p className={cn("text-[10px] font-semibold mb-0.5 flex items-center gap-1", m.sender === "ai" ? "text-emerald-200" : "text-emerald-700")}>
                            {m.sender === "ai" ? <><Bot className="h-3 w-3" /> AI {conv.conv.aiAgent.replace("_", " ")}</> : <><UserCheck className="h-3 w-3" /> Staff</>}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                        <p className={cn("text-[10px] mt-1 flex items-center justify-end gap-1", inbound ? "text-slate-400" : m.sender === "ai" ? "text-emerald-200" : "text-emerald-600")}>
                          {fmtTime(m.createdAt)}
                          {!inbound && (m.status === "read" ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="p-3 border-t border-slate-100 bg-white">
                <div className={cn("mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium",
                  simulate ? "bg-violet-50 text-violet-700" : "bg-slate-50 text-slate-500")}>
                  <FlaskConical className="h-3.5 w-3.5" />
                  {simulate
                    ? "Simulation mode: your message arrives as the PATIENT — watch the AI reply live"
                    : humanMode
                      ? "Human takeover active — you are replying as staff"
                      : "AI is handling this chat — toggle simulation to test AI replies"}
                  <button onClick={() => setSimulate(!simulate)} className="ml-auto underline underline-offset-2">
                    {simulate ? "Reply as staff" : "Simulate patient message"}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Input value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder={simulate ? "Type as the patient… e.g. “berapa harga scaling?”" : "Type a staff reply…"}
                    className="flex-1" />
                  <Button onClick={send} disabled={sendStaff.isPending || simulateInbound.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
