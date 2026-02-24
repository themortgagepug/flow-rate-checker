import { Star, Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const EXAMPLES = [
  { stars: 2, savings: "$4,200/yr", label: "As of last year" },
  { stars: 3, savings: "$2,880/yr", label: "As of last month" },
  { stars: 1, savings: "$7,400/yr", label: "As of today" },
];

const HEADLINES = [
  "Are you paying more interest than you need to?",
  "Are you leaving money on the table?",
  "Is your mortgage still competitive?",
];

interface Props {
  onStart: () => void;
  checksToday: number;
}

export function Hero({ onStart, checksToday }: Props) {
  // Rotate headline based on visit count
  const visitCount = parseInt(localStorage.getItem("rmr_visits") || "0");
  const headline = HEADLINES[visitCount % HEADLINES.length];

  // Increment on mount
  if (typeof window !== "undefined") {
    localStorage.setItem("rmr_visits", String(visitCount + 1));
  }

  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 gradient-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,180,216,0.08),transparent_70%)]" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 pt-20 pb-16 text-center">
        {/* Live counter badge */}
        {checksToday > 0 && (
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-success/30 bg-success/10 text-success text-sm mb-8 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            {checksToday} Canadian mortgages checked today
          </div>
        )}

        {/* Headline */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground mb-4 leading-tight">
          {headline.split(" ").map((word, i) => {
            // Highlight key words in primary color
            const highlights = ["money", "interest", "competitive"];
            if (highlights.some((h) => word.toLowerCase().includes(h))) {
              return (
                <span key={i} className="text-gradient">
                  {word}{" "}
                </span>
              );
            }
            return word + " ";
          })}
        </h1>

        <p className="text-lg text-muted-foreground mb-10 max-w-md mx-auto">
          Find out in seconds. No signup required.
        </p>

        {/* Example cards */}
        <div className="flex items-center justify-center gap-4 mb-10 flex-wrap">
          {EXAMPLES.map((ex, i) => (
            <div
              key={i}
              className="bg-card/60 backdrop-blur-sm border border-border rounded-xl px-5 py-4 text-center min-w-[140px]"
            >
              <div className="flex items-center justify-center gap-0.5 mb-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`w-4 h-4 ${
                      s <= ex.stars
                        ? "fill-warm text-warm"
                        : "fill-transparent text-muted-foreground/20"
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Save</p>
              <p className="text-lg font-bold text-foreground">{ex.savings}</p>
              <p className="text-xs text-muted-foreground">{ex.label}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Button onClick={onStart} size="xl" className="text-lg px-12">
          Rate My Rate <ArrowRight className="w-5 h-5" />
        </Button>

        <p className="text-sm text-muted-foreground mt-4">
          Empowering borrowers to be debt free sooner.
        </p>

        <div className="flex items-center justify-center gap-2 mt-3 text-xs text-muted-foreground">
          <Shield className="w-3.5 h-3.5" />
          Private & secure
        </div>
      </div>
    </section>
  );
}
