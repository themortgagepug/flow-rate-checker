import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface Props {
  value: number;
  onNext: (rate: number) => void;
}

export function QuestionRate({ value, onNext }: Props) {
  const [rate, setRate] = useState(value ? String(value) : "");
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9.]/g, "");
    // Allow only one decimal point
    const parts = val.split(".");
    const sanitized = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : val;
    setRate(sanitized);
    setError("");
  };

  const handleSubmit = () => {
    const num = parseFloat(rate);
    if (isNaN(num) || num < 0.01 || num > 15) {
      setError("Please enter a rate between 0.01% and 15%");
      return;
    }
    onNext(num);
  };

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground mb-2">
        What's your current mortgage rate?
      </h2>
      <p className="text-muted-foreground mb-6">Enter a number like 5.29</p>

      <div className="relative mb-2">
        <input
          type="text"
          inputMode="decimal"
          value={rate}
          onChange={handleChange}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="5.29"
          autoFocus
          className="w-full h-14 rounded-lg border border-border bg-input px-4 pr-12 text-xl text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg font-medium">
          %
        </span>
      </div>

      {error && (
        <p className="text-destructive text-sm mb-4">{error}</p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!rate}
        size="xl"
        className="w-full mt-4"
      >
        Continue <ArrowRight className="w-5 h-5" />
      </Button>
    </div>
  );
}
