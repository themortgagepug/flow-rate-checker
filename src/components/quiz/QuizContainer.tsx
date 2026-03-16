import { useState, useCallback } from "react";
import { Progress } from "@/components/ui/progress";
import { QuestionRate } from "./QuestionRate";
import { QuestionLender } from "./QuestionLender";
import { QuestionBalance } from "./QuestionBalance";
import { QuestionType } from "./QuestionType";
import { QuestionTerm } from "./QuestionTerm";
import { QuestionRenewalDate } from "./QuestionRenewalDate";
import { QuestionPayment } from "./QuestionPayment";
import { QuestionName } from "./QuestionName";
import { QuestionPropertyType } from "./QuestionPropertyType";
import { Shield, ArrowLeft } from "lucide-react";
import type { QuizAnswers, QuizStep } from "@/types";

const STEPS: QuizStep[] = [
  "rate",
  "lender",
  "balance",
  "type",
  "term",
  "renewalDate",
  "payment",
  "propertyType",
  "firstName",
];

interface Props {
  onComplete: (answers: QuizAnswers) => void;
}

export function QuizContainer({ onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>({
    paymentFrequency: "Monthly",
  });

  const progress = ((currentStep + 1) / STEPS.length) * 100;
  const stepName = STEPS[currentStep];

  const goNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep]);

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleComplete = (finalAnswers: QuizAnswers) => {
    onComplete(finalAnswers);
  };

  return (
    <div id="quiz" className="w-full max-w-lg mx-auto">
      <div className="bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-6 md:p-8 shadow-xl">
        {/* Progress */}
        <div className="mb-6">
          <Progress value={progress} className="mb-3" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Question {currentStep + 1} of {STEPS.length}
            </span>
            {currentStep > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            )}
          </div>
        </div>

        {/* Questions */}
        {stepName === "rate" && (
          <QuestionRate
            value={answers.rate || 0}
            onNext={(rate) => {
              setAnswers((a) => ({ ...a, rate }));
              goNext();
            }}
          />
        )}

        {stepName === "lender" && (
          <QuestionLender
            value={answers.lender || ""}
            onNext={(lender, custom) => {
              setAnswers((a) => ({
                ...a,
                lender,
                lenderCustom: custom,
              }));
              goNext();
            }}
          />
        )}

        {stepName === "balance" && (
          <QuestionBalance
            value={answers.balance || 0}
            onNext={(balance) => {
              setAnswers((a) => ({ ...a, balance }));
              goNext();
            }}
          />
        )}

        {stepName === "type" && (
          <QuestionType
            value={answers.type || ""}
            onNext={(type) => {
              setAnswers((a) => ({ ...a, type }));
              goNext();
            }}
          />
        )}

        {stepName === "term" && (
          <QuestionTerm
            value={answers.term || 0}
            onNext={(term) => {
              setAnswers((a) => ({ ...a, term }));
              goNext();
            }}
          />
        )}

        {stepName === "renewalDate" && (
          <QuestionRenewalDate
            value={answers.renewalDate || ""}
            term={answers.term || 5}
            onNext={(renewalDate) => {
              setAnswers((a) => ({ ...a, renewalDate }));
              goNext();
            }}
          />
        )}

        {stepName === "payment" && (
          <QuestionPayment
            value={answers.payment || 0}
            frequency={answers.paymentFrequency || "Monthly"}
            rate={answers.rate || 0}
            balance={answers.balance || 0}
            onNext={(payment, frequency) => {
              setAnswers((a) => ({
                ...a,
                payment,
                paymentFrequency: frequency,
              }));
              goNext();
            }}
          />
        )}

        {stepName === "propertyType" && (
          <QuestionPropertyType
            value={answers.propertyType || ""}
            onNext={(propertyType) => {
              setAnswers((a) => ({ ...a, propertyType }));
              goNext();
            }}
          />
        )}

        {stepName === "firstName" && (
          <QuestionName
            value={answers.firstName || ""}
            onNext={(firstName) => {
              const complete: QuizAnswers = {
                rate: answers.rate!,
                lender: answers.lender!,
                lenderCustom: answers.lenderCustom,
                balance: answers.balance!,
                type: answers.type!,
                term: answers.term!,
                renewalDate: answers.renewalDate!,
                payment: answers.payment!,
                paymentFrequency: answers.paymentFrequency!,
                propertyType: answers.propertyType!,
                firstName,
              };
              handleComplete(complete);
            }}
          />
        )}

        {/* Security badge */}
        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-muted-foreground">
          <Shield className="w-3.5 h-3.5" />
          <span>Bank-level encryption</span>
        </div>
      </div>
    </div>
  );
}
