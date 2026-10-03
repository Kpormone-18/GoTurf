import { useEffect, useState } from "react";
import { BrandMark } from "./BrandMark";

export function LoadingScreen({ label = "Loading GoTurf", inline = false }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(timer);
  }, []);
  return <div className={`brand-loading ${inline ? "brand-loading--inline" : "brand-loading--page"}`} role="status" aria-live="polite" aria-label={label}>
    <BrandMark className="brand-loading__mark" />
    {slow && <p className="brand-loading__notice">This is taking longer than expected. Please check your connection.<br />If a payment is processing, do not submit it again.<br /><a href="/" style={{ color: "#6ee7b7", textDecoration: "underline" }}>Return to Discover</a></p>}
  </div>;
}
