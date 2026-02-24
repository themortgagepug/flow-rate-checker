import { useState, useCallback, useRef } from "react";
import { Hero } from "@/components/Hero";
import { SocialProof } from "@/components/SocialProof";
import { Testimonials } from "@/components/Testimonials";
import { QuizContainer } from "@/components/quiz/QuizContainer";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { ResultsPage } from "@/components/results/ResultsPage";
import { Footer } from "@/components/Footer";
import { computeResults, calculateMonthlyPayment, adjustForFrequency } from "@/lib/calculations";
import { fetchMarketRates, fetchPenaltyEstimate, LENDER_CODES } from "@/lib/supabase";
import type { QuizAnswers, QuizResult } from "@/types";

type Stage = "landing" | "quiz" | "loading" | "results";

export function Home() {
  const [stage, setStage] = useState<Stage>("landing");
  const [result, setResult] = useState<QuizResult | null>(null);
  const quizRef = useRef<HTMLDivElement>(null);

  const handleStart = () => {
    setStage("quiz");
    // Scroll to quiz after a tick
    setTimeout(() => {
      quizRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleQuizComplete = useCallback(async (answers: QuizAnswers) => {
    setStage("loading");

    // If payment wasn't provided, estimate it
    if (!answers.payment) {
      const monthly = calculateMonthlyPayment(answers.balance, answers.rate, 300);
      answers.payment = Math.round(
        adjustForFrequency(monthly, answers.paymentFrequency)
      );
    }

    try {
      // Fetch rates and penalty in parallel
      const [rateData, penaltyData] = await Promise.all([
        fetchMarketRates(),
        fetchPenaltyEstimate({
          lender: LENDER_CODES[answers.lender] || answers.lender,
          mortgageType: answers.type,
          contractRate: answers.rate,
          termYears: answers.term,
          maturityDate: answers.renewalDate,
          balance: answers.balance,
        }),
      ]);

      const penaltyAmount = penaltyData?.penalty_estimate ?? undefined;
      const computed = computeResults(answers, rateData, penaltyAmount);

      // Attach penalty details if available
      if (penaltyData) {
        computed.penaltyType = penaltyData.penalty_type;
        computed.penaltyConfidence = penaltyData.confidence;
        computed.penaltyBreakdown = penaltyData.breakdown;
      }

      setResult(computed);
    } catch (err) {
      console.error("Error computing results:", err);
      // Compute with fallback
      const { getFallbackRates } = await import("@/lib/calculations");
      const computed = computeResults(answers, getFallbackRates());
      setResult(computed);
    }
  }, []);

  const handleLoadingComplete = useCallback(() => {
    setStage("results");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div className="min-h-screen gradient-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-lg font-bold text-foreground">
            <img src="/flow-logo.png" alt="Flow Mortgage" className="h-8 w-8" />
            Flow <span className="text-primary">Mortgage Co.</span>
          </a>
          <a
            href="tel:604-262-3500"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            604-262-3500
          </a>
        </div>
      </header>

      <main className="pt-14">
        {stage === "landing" && (
          <>
            <Hero onStart={handleStart} checksToday={23} />
            <SocialProof />
            <Testimonials />

            {/* Inline quiz preview */}
            <section className="py-16 px-4" ref={quizRef}>
              <QuizContainer onComplete={handleQuizComplete} />
            </section>
          </>
        )}

        {stage === "quiz" && (
          <section className="py-20 px-4" ref={quizRef}>
            <QuizContainer onComplete={handleQuizComplete} />
          </section>
        )}

        {stage === "loading" && (
          <section className="py-20 px-4">
            <LoadingAnimation onComplete={handleLoadingComplete} />
          </section>
        )}

        {stage === "results" && result && (
          <section className="py-20 px-4">
            <ResultsPage result={result} />
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
