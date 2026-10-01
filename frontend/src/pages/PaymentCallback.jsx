import { useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function PaymentCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);
  const reference = params.get("reference") || params.get("trxref");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!reference) { navigate("/"); return; }
    api.get(`/payments/verify/${reference}`)
      .then(({ data }) => {
        if (data.status === "success") navigate(`/confirmation/${data.booking_id}`);
        else { toast.error("Payment was not completed."); navigate(`/checkout/${data.booking_id}`); }
      })
      .catch(() => { toast.error("Could not verify payment."); navigate("/"); });
  }, [reference, navigate]);

  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
        <p className="font-display font-bold text-lg">Verifying your payment…</p>
        <p className="text-sm text-muted-foreground">Please don't close this window.</p>
      </div>
    </div>
  );
}
