import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

export default function Auth() {
  const { loginWith } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const [li, setLi] = useState({ email: "", password: "" });
  const [reg, setReg] = useState({ name: "", email: "", password: "", role: "customer" });

  const go = (user) => {
    if (user.role === "admin") navigate("/admin");
    else if (user.role === "owner") navigate("/owner");
    else navigate("/my-bookings");
  };

  const doLogin = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await api.post("/auth/login", li);
      loginWith(data.token, data.user);
      toast.success(`Welcome back, ${data.user.name}`);
      go(data.user);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const doRegister = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await api.post("/auth/register", reg);
      loginWith(data.token, data.user);
      toast.success("Account created");
      go(data.user);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto px-5 py-16">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-accent px-3 py-1.5 rounded-full mb-4">
          <ShieldCheck className="w-4 h-4" /> Secure sign in
        </div>
        <h1 className="font-display font-black text-3xl">Welcome to GoTurf</h1>
        <p className="text-sm text-muted-foreground mt-1">You can also book as a guest without an account.</p>
      </div>

      <div className="bg-white border border-border rounded-2xl p-6">
        <Tabs defaultValue="login">
          <TabsList className="grid grid-cols-2 w-full mb-6">
            <TabsTrigger value="login" data-testid="tab-login">Sign in</TabsTrigger>
            <TabsTrigger value="register" data-testid="tab-register">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={doLogin} className="space-y-4">
              <div><Label>Email</Label><Input data-testid="login-email" type="email" required value={li.email} onChange={(e) => setLi({ ...li, email: e.target.value })} /></div>
              <div><Label>Password</Label><Input data-testid="login-password" type="password" required value={li.password} onChange={(e) => setLi({ ...li, password: e.target.value })} /></div>
              <Button data-testid="login-submit" disabled={busy} className="w-full bg-primary hover:bg-primary/90">{busy ? "Signing in…" : "Sign in"}</Button>
            </form>
          </TabsContent>

          <TabsContent value="register">
            <form onSubmit={doRegister} className="space-y-4">
              <div><Label>Full name</Label><Input data-testid="reg-name" required value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} /></div>
              <div><Label>Email</Label><Input data-testid="reg-email" type="email" required value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} /></div>
              <div><Label>Password</Label><Input data-testid="reg-password" type="password" required minLength={6} value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} /></div>
              <div>
                <Label>I am a</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {["customer", "owner"].map((r) => (
                    <button type="button" key={r} data-testid={`reg-role-${r}`} onClick={() => setReg({ ...reg, role: r })}
                      className={`py-2 rounded-lg border text-sm font-semibold capitalize ${reg.role === r ? "border-primary bg-accent text-primary" : "border-border text-muted-foreground"}`}>
                      {r === "customer" ? "Player" : "Turf owner"}
                    </button>
                  ))}
                </div>
              </div>
              <Button data-testid="reg-submit" disabled={busy} className="w-full bg-primary hover:bg-primary/90">{busy ? "Creating…" : "Create account"}</Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
