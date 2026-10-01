import { Link } from "react-router-dom";
import { MapPin, Star } from "lucide-react";
import { ghs } from "../lib/api";

export const TurfCard = ({ turf, className = "" }) => (
  <Link
    to={`/turf/${turf.id}`}
    data-testid={`turf-card-${turf.id}`}
    className={`group block bg-white rounded-xl border border-border overflow-hidden hover:border-primary/40 ${className}`}
    style={{ transition: "border-color .2s ease, transform .2s ease" }}
  >
    <div className="relative aspect-[16/10] overflow-hidden bg-muted">
      <img
        src={turf.images?.[0]}
        alt={turf.name}
        className="w-full h-full object-cover group-hover:scale-105"
        style={{ transition: "transform .5s cubic-bezier(.16,1,.3,1)" }}
      />
      <div className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider bg-white/90 backdrop-blur px-2.5 py-1 rounded-full">
        {turf.turf_type}
      </div>
      {turf.rating && (
        <div className="absolute top-3 right-3 flex items-center gap-1 text-xs font-bold bg-primary text-primary-foreground px-2 py-1 rounded-full">
          <Star className="w-3 h-3 fill-current" /> {turf.rating}
        </div>
      )}
    </div>
    <div className="p-4">
      <h3 className="font-display font-extrabold text-lg leading-tight group-hover:text-primary" style={{ transition: "color .2s" }}>
        {turf.name}
      </h3>
      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
        <MapPin className="w-3.5 h-3.5" /> {turf.neighborhood}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div>
          <span className="font-display font-black text-xl">{ghs(turf.base_hourly)}</span>
          <span className="text-xs text-muted-foreground font-semibold">/hr</span>
        </div>
        <span className="text-xs text-muted-foreground">{turf.playing_format}</span>
      </div>
    </div>
  </Link>
);
