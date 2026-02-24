interface Props {
  value: number;
  onNext: (term: number) => void;
}

const TERMS = [1, 2, 3, 4, 5];

export function QuestionTerm({ value, onNext }: Props) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground mb-2">
        What's your mortgage term?
      </h2>
      <p className="text-muted-foreground mb-6">Select your term length</p>

      <div className="grid grid-cols-5 gap-3">
        {TERMS.map((term) => (
          <button
            key={term}
            onClick={() => onNext(term)}
            className={`flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all duration-200 ${
              value === term
                ? "border-primary bg-primary/10"
                : "border-border bg-secondary/30 hover:border-primary/50 hover:bg-secondary/60"
            }`}
          >
            <span className="text-2xl font-bold text-foreground">{term}</span>
            <span className="text-xs text-muted-foreground">
              {term === 1 ? "year" : "years"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
