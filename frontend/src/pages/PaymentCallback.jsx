import { useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { LoadingScreen } from "../components/LoadingScreen";

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

  return <LoadingScreen label="Verifying your payment. Please do not close this window." />;
}
