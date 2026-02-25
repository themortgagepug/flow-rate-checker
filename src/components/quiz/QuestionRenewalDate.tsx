import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar } from "lucide-react";

interface Props {
  value: string;
  term: number;
  onNext: (date: string) => void;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function QuestionRenewalDate({ value, term, onNext }: Props) {
  const [step, setStep] = useState<"year" | "month" | "day">("year");
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: term + 2 }, (_, i) => currentYear + i);

  const handleYearSelect = (y: number) => {
    setYear(y);
    setStep("month");
  };

  const handleMonthSelect = (m: number) => {
    setMonth(m);
    setStep("day");
  };

  const handleDaySelect = (d: number) => {
    if (year !== null && month !== null) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      onNext(dateStr);
    }
  };

  const getDaysInMonth = (y: number, m: number) => {
    return new Date(y, m + 1, 0).getDate();
  };

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground mb-2">
        When does your mortgage renew?
      </h2>
      <p className="text-muted-foreground mb-6">
        Check your mortgage statement, or your best guess will do
      </p>

      {step === "year" && (
        <div className="grid grid-cols-3 gap-3">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => handleYearSelect(y)}
              className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-border bg-secondary/30 hover:border-primary/50 hover:bg-secondary/60 transition-all duration-200"
            >
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-lg font-semibold text-foreground">{y}</span>
            </button>
          ))}
        </div>
      )}

      {step === "month" && year !== null && (
        <div>
          <p className="text-sm text-primary mb-3 font-medium">{year}</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {MONTHS.map((m, i) => (
              <button
                key={m}
                onClick={() => handleMonthSelect(i)}
                className="p-3 rounded-lg border-2 border-border bg-secondary/30 hover:border-primary/50 hover:bg-secondary/60 text-sm font-medium text-foreground transition-all duration-200"
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "day" && year !== null && month !== null && (
        <div>
          <p className="text-sm text-primary mb-3 font-medium">
            {MONTHS[month]} {year}
          </p>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {Array.from(
              { length: getDaysInMonth(year, month) },
              (_, i) => i + 1
            ).map((d) => (
              <button
                key={d}
                onClick={() => handleDaySelect(d)}
                className="p-2 rounded-lg border border-border bg-secondary/30 hover:border-primary/50 hover:bg-secondary/60 text-sm text-foreground transition-all duration-200"
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
