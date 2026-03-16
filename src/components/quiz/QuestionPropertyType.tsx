import { Home, Building2 } from "lucide-react";

interface Props {
  value: string;
  onNext: (type: "Owner Occupied" | "Rental") => void;
}

export function QuestionPropertyType({ value, onNext }: Props) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground mb-2">
        Do you live in this property?
      </h2>
      <p className="text-muted-foreground mb-6">This affects available rates</p>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onNext("Owner Occupied")}
          className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 ${
            value === "Owner Occupied"
              ? "border-primary bg-primary/10"
              : "border-border bg-secondary/30 hover:border-primary/50 hover:bg-secondary/60"
          }`}
        >
          <Home className="w-8 h-8 text-primary" />
          <span className="text-lg font-semibold text-foreground">I live here</span>
          <span className="text-xs text-muted-foreground">Primary residence</span>
        </button>

        <button
          onClick={() => onNext("Rental")}
          className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 ${
            value === "Rental"
              ? "border-primary bg-primary/10"
              : "border-border bg-secondary/30 hover:border-primary/50 hover:bg-secondary/60"
          }`}
        >
          <Building2 className="w-8 h-8 text-primary" />
          <span className="text-lg font-semibold text-foreground">Rental</span>
          <span className="text-xs text-muted-foreground">Investment property</span>
        </button>
      </div>
    </div>
  );
}
