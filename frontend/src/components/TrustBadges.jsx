import { ShieldCheck, Zap, RotateCcw } from "lucide-react";

export const TrustBadges = ({ className = "", detailed = false }) => detailed ? (
  <section className={`rounded-xl border border-primary/20 bg-accent/45 p-4 ${className}`} data-testid="trust-badges" aria-labelledby="booking-confidence">
    <h3 id="booking-confidence" className="text-sm font-bold text-foreground">Book with confidence</h3>
    <div className="mt-3 space-y-3">
      <TrustItem icon={<ShieldCheck className="h-4 w-4" />} title="Escrow-protected payment" detail="Your payment is held until the session is completed." />
      <TrustItem icon={<Zap className="h-4 w-4" />} title="Instant booking confirmation" detail="Your confirmed slot is reserved straight away." />
      <TrustItem icon={<RotateCcw className="h-4 w-4" />} title="Clear cancellation terms" detail="Full refund within the first quarter of the time before kickoff; GHS 30 applies after." />
    </div>
  </section>
) : (
  <div className={`flex flex-wrap gap-3 ${className}`} data-testid="trust-badges">
    <Badge icon={<ShieldCheck className="w-4 h-4" />} label="Escrow protected" />
    <Badge icon={<Zap className="w-4 h-4" />} label="Instant confirmation" />
    <Badge icon={<RotateCcw className="w-4 h-4" />} label="Clear refund policy" />
  </div>
);

const Badge = ({ icon, label }) => (
  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-accent px-3 py-1.5 rounded-full border border-primary/20">
    {icon} {label}
  </div>
);

const TrustItem = ({ icon, title, detail }) => (
  <div className="flex gap-2.5">
    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">{icon}</span>
    <div><p className="text-sm font-semibold text-foreground">{title}</p><p className="text-xs leading-5 text-muted-foreground">{detail}</p></div>
  </div>
);
