import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface Props {
  value: string;
  onNext: (name: string) => void;
}

export function QuestionName({ value, onNext }: Props) {
  const [name, setName] = useState(value || "");

  const handleSubmit = () => {
    if (name.trim()) {
      onNext(name.trim());
    }
  };

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground mb-2">
        Last thing — what's your first name?
      </h2>
      <p className="text-muted-foreground mb-6">
        So we can personalize your results
      </p>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="Your first name"
        autoFocus
        className="w-full h-14 rounded-lg border border-border bg-input px-4 text-xl text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors mb-2"
      />

      <Button
        onClick={handleSubmit}
        disabled={!name.trim()}
        size="xl"
        className="w-full mt-4"
      >
        See My Results <ArrowRight className="w-5 h-5" />
      </Button>
    </div>
  );
}
