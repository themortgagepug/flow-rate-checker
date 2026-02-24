import { Phone, Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="py-10 px-4 border-t border-border/50">
      <div className="max-w-3xl mx-auto text-center">
        <div className="mb-4">
          <span className="inline-flex items-center gap-2 text-lg font-bold text-foreground">
            <img src="/flow-logo.png" alt="Flow Mortgage" className="h-7 w-7" />
            Flow{" "}
            <span className="text-primary">Mortgage</span>
          </span>
        </div>

        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground mb-4">
          <a
            href="tel:604-262-3500"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            604-262-3500
          </a>
          <a
            href="mailto:info@getflowmortgage.ca"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            info@getflowmortgage.ca
          </a>
        </div>

        <p className="text-xs text-muted-foreground/60">
          Flow Mortgage Co. is licensed with BRX Mortgage. All mortgage rates are subject to change and may vary based on qualification criteria.
          This tool provides estimates only and does not constitute financial advice.
        </p>
      </div>
    </footer>
  );
}
