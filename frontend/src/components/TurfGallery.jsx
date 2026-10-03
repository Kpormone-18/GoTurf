import { useState } from "react";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

export function TurfGallery({ images = [], name }) {
  const [selected, setSelected] = useState(null);
  const photoCount = images.length;
  const current = selected == null ? 0 : selected;
  const show = (index) => setSelected(index);
  const previous = () => setSelected((index) => (index + photoCount - 1) % photoCount);
  const next = () => setSelected((index) => (index + 1) % photoCount);

  if (!photoCount) return <div className="h-[340px] rounded-2xl bg-secondary" aria-label="No turf photos yet" />;

  return (
    <>
      <div className="relative grid h-64 grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl sm:h-[420px]">
        <GalleryButton image={images[0]} label={`View ${name} photo 1`} className={`col-span-4 row-span-2 ${photoCount > 1 ? "sm:col-span-2" : ""}`} onClick={() => show(0)} />
        {images.slice(1, 3).map((image, index) => <GalleryButton key={image} image={image} label={`View ${name} photo ${index + 2}`} className={`hidden sm:block col-span-2 ${photoCount === 2 ? "row-span-2" : ""}`} onClick={() => show(index + 1)} />)}
        <button type="button" onClick={() => show(0)} className="absolute bottom-3 right-3 flex min-h-11 items-center gap-2 rounded-lg border border-white/30 bg-white px-3 text-xs font-bold text-foreground shadow-sm"><Images className="h-4 w-4" /> View {photoCount} {photoCount === 1 ? "photo" : "photos"}</button>
      </div>

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-5xl border-0 bg-slate-950 p-3 text-white sm:p-5" onKeyDown={(event) => { if (event.key === "ArrowLeft") previous(); if (event.key === "ArrowRight") next(); }}>
          <DialogTitle className="sr-only">{name} photo {current + 1} of {photoCount}</DialogTitle>
          <div className="relative flex min-h-[55vh] items-center justify-center">
            <img src={images[current]} alt={`${name} — photo ${current + 1}`} className="max-h-[70vh] w-full object-contain" />
            {photoCount > 1 && <>
              <button type="button" onClick={previous} aria-label="Previous photo" className="absolute left-1 grid h-10 w-10 place-items-center rounded-full bg-black/60 hover:bg-black sm:left-3"><ChevronLeft /></button>
              <button type="button" onClick={next} aria-label="Next photo" className="absolute right-1 grid h-10 w-10 place-items-center rounded-full bg-black/60 hover:bg-black sm:right-3"><ChevronRight /></button>
            </>}
          </div>
          <div className="flex items-center justify-between gap-3 px-1"><span className="text-sm text-slate-300">Photo {current + 1} of {photoCount}</span><div className="flex max-w-[70%] gap-2 overflow-x-auto">{images.map((image, index) => <button type="button" key={image} onClick={() => show(index)} aria-label={`View photo ${index + 1}`} className={`h-12 w-16 shrink-0 overflow-hidden rounded border-2 ${index === current ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}><img src={image} alt="" className="h-full w-full object-cover" /></button>)}</div></div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GalleryButton({ image, label, className, onClick }) {
  return <button type="button" onClick={onClick} aria-label={label} className={`${className} overflow-hidden bg-muted text-left`}><img src={image} alt="" className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]" /></button>;
}
