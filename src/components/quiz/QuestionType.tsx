import { Lock, TrendingUp } from "lucide-react";

interface Props {
  value: string;
  onNext: (type: "Fixed" | "Variable") => void;
}

export function QuestionType({ value, onNext }: Props) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground mb-2">
        Is your rate fixed or variable?
      </h2>
      <p className="text-muted-foreground mb-6">Select your mortgage type</p>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onNext("Fixed")}
          className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 ${
            value === "Fixed"
              ? "border-primary bg-primary/10"
              : "border-border bg-secondary/30 hover:border-primary/50 hover:bg-secondary/60"
          }`}
        >
          <Lock className="w-8 h-8 text-primary" />
          <span className="text-lg font-semibold text-foreground">Fixed</span>
          <span className="text-xs text-muted-foreground">Same rate every payment</span>
        </button>

        <button
          onClick={() => onNext("Variable")}
          className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 ${
            value === "Variable"
              ? "border-primary bg-primary/10"
              : "border-border bg-secondary/30 hover:border-primary/50 hover:bg-secondary/60"
          }`}
        >
          <TrendingUp className="w-8 h-8 text-primary" />
          <span className="text-lg font-semibold text-foreground">Variable</span>
          <span className="text-xs text-muted-foreground">Rate can change</span>
        </button>
      </div>
    </div>
  );
}
