import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, Panel } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { UserCircle } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user, branch } = useAuth();
  const utils = trpc.useUtils();
  const settings = trpc.settings.get.useQuery();
  const [company, setCompany] = useState<any>(null);
  const [notif, setNotif] = useState<any>(null);
  const [ai, setAi] = useState<any>(null);

  useEffect(() => {
    if (settings.data) {
      setCompany(settings.data.company);
      setNotif(settings.data.notifications);
      setAi(settings.data.ai);
    }
  }, [settings.data]);

  const update = trpc.settings.update.useMutation({
    onSuccess: async () => { toast.success("Settings saved"); await utils.settings.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const isHq = user?.role === "hq";
  const canEdit = ["hq", "branch_manager"].includes(user?.role ?? "");

  if (settings.isLoading || !company) {
    return <div className="space-y-5 -mt-6"><PageHeader title="Settings" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-5 -mt-6 max-w-4xl">
      <PageHeader title="Settings" description="Company profile, branding, notifications and AI configuration" />

      {/* Profile card */}
      <Panel>
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14"><AvatarFallback className="bg-emerald-600 text-white text-lg">{initials(user?.name ?? "?")}</AvatarFallback></Avatar>
          <div className="flex-1">
            <p className="font-bold text-slate-900">{user?.name}</p>
            <p className="text-sm text-slate-500">{user?.title ?? user?.specialization ?? ""} · {user?.email}</p>
            <p className="text-xs text-emerald-600 mt-0.5">{branch ? branch.name : "HQ — All Branches"}</p>
          </div>
          <UserCircle className="h-5 w-5 text-slate-300" />
        </div>
      </Panel>

      <Panel title="Company Profile" subtitle="Appears on invoices and patient communications">
        <div className="grid grid-cols-2 gap-4">
          {[
            { k: "name", l: "Company Name" }, { k: "registrationNo", l: "Registration No" },
            { k: "email", l: "Email" }, { k: "phone", l: "Phone" },
            { k: "website", l: "Website" }, { k: "address", l: "Address", span: true },
          ].map((f) => (
            <div key={f.k} className={f.span ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
              <Label>{f.l}</Label>
              <Input value={company?.[f.k] ?? ""} disabled={!canEdit} onChange={(e) => setCompany({ ...company, [f.k]: e.target.value })} />
            </div>
          ))}
        </div>
        {canEdit && <div className="flex justify-end mt-4"><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={update.isPending} onClick={() => update.mutate({ key: "company", value: company })}>Save Company Profile</Button></div>}
      </Panel>

      <Panel title="Branding" subtitle="Medini Dental identity">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xl">M</div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Primary Green · #0d9d6c</p>
            <p className="text-xs text-slate-400">Inspired by Medini Dental branding — white surfaces, light greys, professional healthcare appearance.</p>
          </div>
        </div>
      </Panel>

      <Panel title="Notifications" subtitle="Patient reminders and staff alerts">
        <div className="space-y-4">
          {[
            { k: "whatsappReminders", l: "WhatsApp appointment reminders", d: "Sent automatically before each appointment" },
            { k: "emailNotifications", l: "Email notifications", d: "Daily summaries to branch managers" },
            { k: "dailyClosingReport", l: "Daily closing report", d: "Collection summary at end of day" },
          ].map((f) => (
            <div key={f.k} className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-slate-800">{f.l}</p><p className="text-xs text-slate-400">{f.d}</p></div>
              <Switch checked={notif?.[f.k] ?? false} disabled={!canEdit} onCheckedChange={(v) => setNotif({ ...notif, [f.k]: v })} />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label>Reminder timing (hours before appointment)</Label>
            <Input type="number" className="w-32" value={notif?.reminderHoursBefore ?? 24} disabled={!canEdit} onChange={(e) => setNotif({ ...notif, reminderHoursBefore: Number(e.target.value) })} />
          </div>
        </div>
        {canEdit && <div className="flex justify-end mt-4"><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={update.isPending} onClick={() => update.mutate({ key: "notifications", value: notif })}>Save Notifications</Button></div>}
      </Panel>

      {isHq && (
        <Panel title="AI Configuration" subtitle="Escalation rules for all AI employees">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-slate-800">Auto-escalate low confidence</p><p className="text-xs text-slate-400">Hand over to human staff when AI is unsure</p></div>
              <Switch checked={ai?.autoEscalate ?? true} onCheckedChange={(v) => setAi({ ...ai, autoEscalate: v })} />
            </div>
            <div className="space-y-1.5">
              <Label>Confidence threshold (0.0 – 1.0)</Label>
              <Input type="number" step="0.05" min={0} max={1} className="w-32" value={ai?.confidenceThreshold ?? 0.6} onChange={(e) => setAi({ ...ai, confidenceThreshold: Number(e.target.value) })} />
              <p className="text-xs text-slate-400">Replies below this confidence are escalated to a human instead of being sent.</p>
            </div>
            <div className="space-y-1.5">
              <Label>AI Languages</Label>
              <p className="text-sm text-slate-600">{(ai?.languages ?? []).join(" · ")}</p>
            </div>
          </div>
          <div className="flex justify-end mt-4"><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={update.isPending} onClick={() => update.mutate({ key: "ai", value: ai })}>Save AI Configuration</Button></div>
        </Panel>
      )}
    </div>
  );
}
