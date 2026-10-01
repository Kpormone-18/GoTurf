export const Footer = () => (
  <footer className="border-t border-border bg-white mt-20">
    <div className="max-w-7xl mx-auto px-5 lg:px-8 py-12 grid md:grid-cols-4 gap-8">
      <div className="md:col-span-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-8 h-8 rounded-lg bg-primary grid place-items-center text-primary-foreground font-display font-black">G</span>
          <span className="font-display font-black text-lg">GoTurf</span>
        </div>
        <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
          Book AstroTurf pitches across Accra with instant confirmation and escrow-protected payments.
          Funds are held safely until your session ends.
        </p>
      </div>
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-3">Trust</div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>Escrow-protected payments</li>
          <li>Instant booking confirmation</li>
          <li>Transparent refund policy</li>
        </ul>
      </div>
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-3">Policies</div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>Cancellation &amp; refunds</li>
          <li>Owner obligations</li>
          <li>Privacy &amp; terms</li>
        </ul>
      </div>
    </div>
    <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
      © 2026 GoTurf · Accra, Ghana · Events coming in V2
    </div>
  </footer>
);
