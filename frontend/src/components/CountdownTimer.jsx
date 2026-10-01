import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

export const CountdownTimer = ({ seconds, deadline }) => {
  const [remaining, setRemaining] = useState(seconds || 0);

  useEffect(() => {
    setRemaining(seconds || 0);
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds, deadline]);

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const label = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;

  if (remaining <= 0)
    return (
      <div data-testid="refund-countdown" className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Clock className="w-4 h-4" /> Full-refund window has passed
      </div>
    );

  return (
    <div data-testid="refund-countdown" className="flex items-center gap-2 text-sm font-bold text-primary">
      <Clock className="w-4 h-4" />
      <span>Full refund available for {label}</span>
    </div>
  );
};
