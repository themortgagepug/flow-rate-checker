import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Props {
  value: number;
  onNext: (balance: number) => void;
}

export function QuestionBalance({ value, onNext }: Props) {
  const [balance, setBalance] = useState(value || 400000);
  const [inputValue, setInputValue] = useState(
    value ? value.toLocaleString() : "400,000"
  );
  const [error, setError] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    const num = parseInt(raw) || 0;
    setInputValue(num ? num.toLocaleString() : "");
    setBalance(num);
    setError("");
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = parseInt(e.target.value);
    setBalance(num);
    setInputValue(num.toLocaleString());
    setError("");
  };

  const handleSubmit = () => {
    if (balance < 1000 || balance > 10000000) {
      setError("Please enter an amount between $1,000 and $10,000,000");
      return;
    }
    onNext(balance);
  };

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground mb-2">
        What's your current mortgage balance?
      </h2>
      <p className="text-muted-foreground mb-6">Your best guess is fine</p>

      <div className="relative mb-4">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg font-medium">
          $
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="400,000"
          className="w-full h-14 rounded-lg border border-border bg-input pl-8 pr-4 text-xl text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
        />
      </div>

      {/* Slider */}
      <div className="mb-2">
        <input
          type="range"
          min={50000}
          max={2000000}
          step={5000}
          value={Math.min(balance, 2000000)}
          onChange={handleSliderChange}
          className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>$50K</span>
          <span>$2M+</span>
        </div>
      </div>

      {error && (
        <p className="text-destructive text-sm mb-4">{error}</p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!balance}
        size="xl"
        className="w-full mt-4"
      >
        Continue <ArrowRight className="w-5 h-5" />
      </Button>
    </div>
  );
}
