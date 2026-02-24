import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Calculator } from "lucide-react";
import { calculateMonthlyPayment, adjustForFrequency } from "@/lib/calculations";

interface Props {
  value: number;
  frequency: "Monthly" | "Bi-weekly" | "Weekly";
  rate: number;
  balance: number;
  onNext: (payment: number, frequency: "Monthly" | "Bi-weekly" | "Weekly") => void;
}

const FREQUENCIES = ["Monthly", "Bi-weekly", "Weekly"] as const;

export function QuestionPayment({
  value,
  frequency: initialFreq,
  rate,
  balance,
  onNext,
}: Props) {
  const [freq, setFreq] = useState<"Monthly" | "Bi-weekly" | "Weekly">(
    initialFreq || "Monthly"
  );
  const [inputValue, setInputValue] = useState(
    value ? value.toLocaleString() : ""
  );
  const [payment, setPayment] = useState(value || 0);

  // Auto-estimated payment (25-year amortization)
  const estimated = useMemo(() => {
    if (!rate || !balance) return 0;
    const monthly = calculateMonthlyPayment(balance, rate, 300);
    return Math.round(adjustForFrequency(monthly, freq));
  }, [rate, balance, freq]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    const num = parseInt(raw) || 0;
    setInputValue(num ? num.toLocaleString() : "");
    setPayment(num);
  };

  const handleUseEstimate = () => {
    setPayment(estimated);
    setInputValue(estimated.toLocaleString());
  };

  const handleSubmit = () => {
    const finalPayment = payment || estimated;
    onNext(finalPayment, freq);
  };

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground mb-2">
        What's your regular payment?
      </h2>
      <p className="text-muted-foreground mb-6">
        Optional — we can estimate this for you
      </p>

      {/* Frequency toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden mb-4">
        {FREQUENCIES.map((f) => (
          <button
            key={f}
            onClick={() => setFreq(f)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              freq === f
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="relative mb-3">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg font-medium">
          $
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder={estimated ? estimated.toLocaleString() : "2,100"}
          className="w-full h-14 rounded-lg border border-border bg-input pl-8 pr-4 text-xl text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
        />
      </div>

      {estimated > 0 && !payment && (
        <button
          onClick={handleUseEstimate}
          className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 mb-4 transition-colors"
        >
          <Calculator className="w-4 h-4" />
          Use estimated: ${estimated.toLocaleString()}/{freq.toLowerCase()}
        </button>
      )}

      <Button
        onClick={handleSubmit}
        size="xl"
        className="w-full mt-2"
      >
        Continue <ArrowRight className="w-5 h-5" />
      </Button>
    </div>
  );
}
