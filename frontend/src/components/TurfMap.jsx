import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { Link } from "react-router-dom";
import { ghs } from "../lib/api";

const ACCRA = [5.6037, -0.187];

export const TurfMap = ({ turfs }) => {
  const pins = turfs.filter((t) => t.lat != null && t.lng != null);
  return (
    <div className="rounded-xl overflow-hidden border border-border" data-testid="turf-map" style={{ height: 520 }}>
      <MapContainer center={ACCRA} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pins.map((t) => (
          <CircleMarker
            key={t.id}
            center={[t.lat, t.lng]}
            radius={11}
            pathOptions={{ color: "#047857", fillColor: "#059669", fillOpacity: 0.9, weight: 2 }}
          >
            <Popup>
              <div className="min-w-[180px]">
                <img src={t.images?.[0]} alt={t.name} className="w-full h-20 object-cover rounded mb-2" />
                <div className="font-bold text-sm">{t.name}</div>
                <div className="text-xs text-slate-500">{t.neighborhood} · {t.turf_type}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-bold text-sm">{ghs(t.base_hourly)}/hr</span>
                  <Link to={`/turf/${t.id}`} className="text-xs font-bold text-emerald-700 underline">View</Link>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
};
