import { ShieldCheck, Zap, RotateCcw } from "lucide-react";

export const TrustBadges = ({ className = "" }) => (
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
