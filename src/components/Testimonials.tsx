import { Quote } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "I had no idea I was paying 1.4% above the going rate. This tool flagged it in under a minute — I switched lenders and saved over $3,800 in the first year alone.",
    name: "Sarah K.",
    location: "Homeowner, Ontario",
  },
  {
    quote:
      "My renewal was coming up and I had no idea if my bank's offer was even competitive. Took two minutes to get my grade — turns out I was overpaying by $2,100 a year. Total game changer.",
    name: "James M.",
    location: "Homeowner, BC",
  },
];

export function Testimonials() {
  return (
    <section className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="grid md:grid-cols-2 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl p-6"
            >
              <Quote className="w-8 h-8 text-primary/40 mb-4" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                "{t.quote}"
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">
                    {t.name[0]}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.location}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
