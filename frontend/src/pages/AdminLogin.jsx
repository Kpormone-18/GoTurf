import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Lock } from "lucide-react";

export default function AdminLogin() {
  const { loginWith } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [li, setLi] = useState({ email: "", password: "" });

  const doLogin = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await api.post("/auth/login", li);
      if (data.user.role !== "admin") { toast.error("Admin access only."); setBusy(false); return; }
      loginWith(data.token, data.user);
      navigate("/admin");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-950 text-white p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <span className="w-10 h-10 rounded-lg bg-slate-800 border border-white/10 grid place-items-center font-display font-black text-lg">G</span>
          <div>
            <div className="font-display font-black text-xl leading-none">GoTurf</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Admin Console</div>
          </div>
        </div>
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-6">
          <h1 className="font-display font-black text-2xl mb-1">Restricted access</h1>
          <p className="text-sm text-white/50 mb-6 flex items-center gap-1.5"><Lock className="w-4 h-4" /> Platform staff only</p>
          <form onSubmit={doLogin} className="space-y-4">
            <div><Label className="text-white/70">Email</Label><Input data-testid="admin-login-email" type="email" required value={li.email} onChange={(e) => setLi({ ...li, email: e.target.value })} className="bg-slate-800 border-white/10 text-white" /></div>
            <div><Label className="text-white/70">Password</Label><Input data-testid="admin-login-password" type="password" required value={li.password} onChange={(e) => setLi({ ...li, password: e.target.value })} className="bg-slate-800 border-white/10 text-white" /></div>
            <Button data-testid="admin-login-submit" disabled={busy} className="w-full bg-white text-slate-900 hover:bg-white/90 font-bold">{busy ? "Verifying…" : "Sign in"}</Button>
          </form>
        </div>
        <a href="/" className="block text-center text-xs text-white/40 hover:text-white/70 mt-4">← Back to GoTurf</a>
      </div>
    </div>
  );
}
