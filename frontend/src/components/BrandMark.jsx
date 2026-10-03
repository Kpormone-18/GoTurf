export function BrandMark({ className = "h-10 w-10", decorative = true }) {
  return <img src="/brand/goturf-emblem.png" alt={decorative ? "" : "GoTurf"} className={`object-contain shrink-0 ${className}`} width="96" height="96" />;
}
