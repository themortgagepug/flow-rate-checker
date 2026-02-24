export function SocialProof() {
  return (
    <section className="py-10 px-4 border-y border-border/50 bg-secondary/20">
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-6">
          Powered by Flow Mortgage — Trusted by 4,000+ Canadian families
        </p>
        <div className="flex items-center justify-center gap-8 flex-wrap opacity-50">
          <span className="text-sm font-semibold text-muted-foreground">
            Licensed with BRX Mortgage
          </span>
          <span className="text-muted-foreground/30">|</span>
          <span className="text-sm font-semibold text-muted-foreground">
            400+ 5-Star Reviews
          </span>
          <span className="text-muted-foreground/30">|</span>
          <span className="text-sm font-semibold text-muted-foreground">
            Top 20 Broker in Canada
          </span>
        </div>
      </div>
    </section>
  );
}
