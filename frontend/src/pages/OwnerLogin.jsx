import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { toast } from "sonner";
import { Building2, ShieldCheck } from "lucide-react";

export default function OwnerLogin() {
  const { loginWith } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [li, setLi] = useState({ email: "", password: "" });
  const [reg, setReg] = useState({ name: "", email: "", password: "" });

  const after = (u) => {
    if (u.role === "owner" || u.role === "admin") navigate("/owner");
    else { toast.error("This portal is for turf owners."); }
  };

  const doLogin = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const { data } = await api.post("/auth/login", li); loginWith(data.token, data.user); after(data.user); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); } finally { setBusy(false); }
  };
  const doReg = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const { data } = await api.post("/auth/register", { ...reg, role: "owner" }); loginWith(data.token, data.user); toast.success("Owner account created"); navigate("/owner"); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-[#06281f] text-white p-12 relative overflow-hidden">
        <img src="https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200" alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
        <div className="relative flex items-center gap-2">
          <span className="w-9 h-9 rounded-lg bg-primary grid place-items-center font-display font-black text-lg">G</span>
          <span className="font-display font-black text-xl">GoTurf</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Owner</span>
        </div>
        <div className="relative">
          <h1 className="font-display font-black text-4xl leading-tight">Fill every slot.<br />Get paid reliably.</h1>
          <p className="mt-4 text-white/70 max-w-sm">List your pitch, manage availability and pricing, and receive escrow-protected payouts after each session.</p>
          <ul className="mt-6 space-y-2 text-sm text-white/80">
            <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Verified owners build customer trust</li>
            <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Automatic payouts 30 min after play</li>
          </ul>
        </div>
        <div className="relative text-xs text-white/50">© 2026 GoTurf · Accra</div>
      </div>

      <div className="flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-6 lg:hidden">
            <span className="w-9 h-9 rounded-lg bg-primary grid place-items-center text-primary-foreground font-display font-black">G</span>
            <span className="font-display font-black text-xl">GoTurf Owner</span>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-accent px-3 py-1.5 rounded-full mb-4">
            <Building2 className="w-4 h-4" /> Turf owner portal
          </div>
          <h2 className="font-display font-black text-3xl mb-6">Owner sign in</h2>
          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="login" data-testid="owner-tab-login">Sign in</TabsTrigger>
              <TabsTrigger value="register" data-testid="owner-tab-register">Become an owner</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={doLogin} className="space-y-4">
                <div><Label>Email</Label><Input data-testid="owner-login-email" type="email" required value={li.email} onChange={(e) => setLi({ ...li, email: e.target.value })} /></div>
                <div><Label>Password</Label><Input data-testid="owner-login-password" type="password" required value={li.password} onChange={(e) => setLi({ ...li, password: e.target.value })} /></div>
                <Button data-testid="owner-login-submit" disabled={busy} className="w-full bg-primary hover:bg-primary/90">{busy ? "Signing in…" : "Enter console"}</Button>
              </form>
            </TabsContent>
            <TabsContent value="register">
              <form onSubmit={doReg} className="space-y-4">
                <div><Label>Business / owner name</Label><Input data-testid="owner-reg-name" required value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} /></div>
                <div><Label>Email</Label><Input data-testid="owner-reg-email" type="email" required value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} /></div>
                <div><Label>Password</Label><Input data-testid="owner-reg-password" type="password" required minLength={6} value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} /></div>
                <p className="text-xs text-muted-foreground">You'll complete Ghana Card verification before publishing turfs.</p>
                <Button data-testid="owner-reg-submit" disabled={busy} className="w-full bg-primary hover:bg-primary/90">{busy ? "Creating…" : "Create owner account"}</Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
