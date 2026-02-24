import { useState, useEffect } from "react";
import { Search, BarChart3, DollarSign, Trophy } from "lucide-react";

const STEPS = [
  { label: "Scanning live rates", icon: Search, duration: 1800 },
  { label: "Comparing your deal", icon: BarChart3, duration: 1800 },
  { label: "Crunching savings", icon: DollarSign, duration: 1800 },
  { label: "Evaluating your mortgage", icon: Trophy, duration: 1600 },
];

interface Props {
  onComplete: () => void;
}

export function LoadingAnimation({ onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [savingsCounter, setSavingsCounter] = useState(0);

  useEffect(() => {
    let stepIndex = 0;
    const advanceStep = () => {
      stepIndex++;
      if (stepIndex >= STEPS.length) {
        setTimeout(onComplete, 500);
        return;
      }
      setCurrentStep(stepIndex);
      setTimeout(advanceStep, STEPS[stepIndex].duration);
    };
    setTimeout(advanceStep, STEPS[0].duration);
  }, [onComplete]);

  // Animate savings counter
  useEffect(() => {
    const target = 4200;
    const duration = 6000;
    const startTime = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setSavingsCounter(Math.round(target * eased));

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, []);

  const CurrentIcon = STEPS[currentStep].icon;

  return (
    <div className="w-full max-w-md mx-auto text-center py-20 animate-fade-in">
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center mx-auto animate-pulse-glow">
          <CurrentIcon className="w-10 h-10 text-primary-foreground" />
        </div>
      </div>

      <p className="text-lg font-semibold text-foreground mb-2">
        {STEPS[currentStep].label}
      </p>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i <= currentStep
                ? "w-8 gradient-primary"
                : "w-4 bg-secondary"
            }`}
          />
        ))}
      </div>

      {/* Savings counter */}
      {savingsCounter > 0 && (
        <div className="animate-fade-in">
          <p className="text-sm text-muted-foreground mb-1">
            Potential savings found
          </p>
          <p className="text-3xl font-bold text-success">
            ${savingsCounter.toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
