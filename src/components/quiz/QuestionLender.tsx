import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LENDERS } from "@/lib/lenders";
import { ArrowRight, Building2 } from "lucide-react";

interface Props {
  value: string;
  onNext: (lender: string, custom?: string) => void;
}

export function QuestionLender({ value, onNext }: Props) {
  const [selected, setSelected] = useState(value || "");
  const [customName, setCustomName] = useState("");

  const handleSelect = (lender: string) => {
    setSelected(lender);
    if (lender !== "Other") {
      onNext(lender);
    }
  };

  const handleOtherSubmit = () => {
    if (customName.trim()) {
      onNext("Other", customName.trim());
    }
  };

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground mb-2">
        Who holds your mortgage?
      </h2>
      <p className="text-muted-foreground mb-6">Select your lender</p>

      <div className="grid grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
        {LENDERS.map((lender) => (
          <button
            key={lender.value}
            onClick={() => handleSelect(lender.value)}
            className={`flex items-center gap-3 p-3.5 rounded-lg border text-left transition-all duration-200 ${
              selected === lender.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/50 hover:bg-secondary"
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0 opacity-60" />
            <span className="text-sm font-medium">{lender.label}</span>
          </button>
        ))}
      </div>

      {selected === "Other" && (
        <div className="mt-4 animate-fade-in">
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleOtherSubmit()}
            placeholder="Enter your lender's name"
            autoFocus
            className="w-full h-12 rounded-lg border border-border bg-input px-4 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
          />
          <Button
            onClick={handleOtherSubmit}
            disabled={!customName.trim()}
            size="lg"
            className="w-full mt-3"
          >
            Continue <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
