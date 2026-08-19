import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Tooth } from "@/components/ToothIcon";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";

const demoAccounts = [
  { role: "HQ Super Admin", username: "hq", desc: "Full access · all 14 branches", color: "border-emerald-300 bg-emerald-50" },
  { role: "Branch Manager", username: "manager", desc: "One branch · full branch control", color: "border-blue-300 bg-blue-50" },
  { role: "Branch Admin", username: "reception", desc: "Reception · daily operations", color: "border-amber-300 bg-amber-50" },
  { role: "Doctor", username: "doctor", desc: "Clinical workspace only", color: "border-violet-300 bg-violet-50" },
];

/* S10 T1: demo account panel only in dev; production login is clean. */
const isDev = import.meta.env.DEV;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    try {
      await login(username.trim(), password);
      toast.success("Welcome to Medini AI Dental CRM");
      navigate("/dashboard");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0a1f16]">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/20 via-transparent to-emerald-900/40" />
        <div className="relative flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500 p-2"><Tooth className="h-6 w-6" /></div>
          <span className="text-xl font-bold">Medini Dental Group</span>
        </div>
        <div className="relative space-y-6 max-w-lg">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
            The AI-first<br />Dental Operating System
          </h1>
          <p className="text-emerald-100/80 text-lg leading-relaxed">
            One platform for 14 branches — AI receptionist, smart booking, clinical records, finance, WhatsApp hub and business analytics.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[{ v: "14", l: "Branches" }, { v: "8", l: "AI Employees" }, { v: "24/7", l: "AI Reception" }].map((s) => (
              <div key={s.l} className="rounded-xl border border-white/15 bg-white/5 p-4">
                <p className="text-2xl font-bold text-emerald-400">{s.v}</p>
                <p className="text-xs text-slate-300 mt-1">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-slate-400">© 2026 Medini Dental Group · Enterprise MVP</p>
      </div>

      {/* Right login form */}
      <div className="w-full lg:w-[480px] bg-white flex flex-col justify-center px-8 sm:px-14">
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="rounded-lg bg-emerald-500 p-1.5 text-white"><Tooth className="h-5 w-5" /></div>
          <span className="font-bold text-lg">Medini Dental</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6">Access your workspace</p>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. hq" autoComplete="username" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </div>
          <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Sign in
          </Button>
        </form>

        {isDev && (
          <div className="mt-8">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Demo accounts — password: <code className="text-emerald-600 font-bold">medini123</code></p>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((a) => (
                <button
                  key={a.username}
                  type="button"
                  onClick={() => { setUsername(a.username); setPassword("medini123"); }}
                  className={`rounded-xl border p-3 text-left transition hover:shadow-sm ${a.color}`}
                >
                  <p className="text-[13px] font-semibold text-slate-800">{a.role}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{a.desc}</p>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">{a.username}</p>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-6 text-center">
          <a href="#" className="text-xs text-slate-400 hover:text-emerald-600">Forgot password?</a>
        </div>
      </div>
    </div>
  );
}
