import { useEffect, useRef } from "react";

export function HeroArtwork() {
  const artwork = useRef(null);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame;
    const update = () => {
      frame = null;
      const section = artwork.current?.closest("section");
      if (!section) return;
      const progress = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / section.offsetHeight));
      artwork.current.style.setProperty("--hero-scale", motion.matches ? "1" : String(1 + progress * 0.18));
    };
    const schedule = () => { if (frame == null) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    motion.addEventListener("change", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      motion.removeEventListener("change", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={artwork} className="hero-artwork" aria-hidden="true">
    <div className="hero-pitch-lines" />
    <svg className="hero-football" viewBox="0 0 400 400" fill="none">
      <defs>
        <radialGradient id="ball-base" cx=".32" cy=".25" r=".8"><stop stopColor="#f0fff3" /><stop offset=".52" stopColor="#b4d8c4" /><stop offset="1" stopColor="#245548" /></radialGradient>
        <radialGradient id="ball-shade" cx=".34" cy=".25" r=".74"><stop offset=".4" stopColor="#032d23" stopOpacity="0" /><stop offset="1" stopColor="#032d23" stopOpacity=".75" /></radialGradient>
        <clipPath id="ball-clip"><circle cx="200" cy="200" r="177" /></clipPath>
      </defs>
      <circle cx="200" cy="200" r="177" fill="url(#ball-base)" />
      <g clipPath="url(#ball-clip)" stroke="#5f9781" strokeWidth="3" strokeLinejoin="round">
        <path d="m174 120 77 22 17 80-65 46-65-53Z" fill="#164e3b" />
        <path d="m101 39 64-13 36 38-27 56-63 10-45-48Z" fill="#326b55" />
        <path d="m305 65 57 63-23 51-71 43-17-80Z" fill="#285c48" />
        <path d="m325 275 27 58-61 44-57-26-31-83 65-46Z" fill="#1c503e" />
        <path d="m38 259 44-31 56-13 65 53-33 76-66 4-56-45Z" fill="#d6e9da" />
        <path d="m23 127 43-45 45 48 27 85-56 13-54-39Z" fill="#326b55" />
        <path d="m170 344 64 7 57 26-103 27-84-56Z" fill="#2b624c" />
        <path d="m201 64 68-21 36 22-54 77M339 179l48 18M325 275l55-22M111 130l63-10M82 228l-3 93" />
      </g>
      <circle cx="200" cy="200" r="177" fill="url(#ball-shade)" />
      <circle cx="200" cy="200" r="176" stroke="#e0ffed" strokeOpacity=".35" strokeWidth="2" />
    </svg>
    <span className="hero-art-caption">GAME ON <span>ANYWHERE · ANYTIME</span></span>
  </div>;
}
