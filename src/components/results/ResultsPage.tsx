import { useState } from "react";
import { StarRating } from "./StarRating";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowRight,
  TrendingDown,
  Calendar,
  DollarSign,
  Clock,
  Shield,
  Send,
  Phone,
  Mail,
  Share2,
} from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { saveSubmission, sendReport } from "@/lib/supabase";
import { pushToZohoCRM } from "@/lib/zoho";
import type { QuizResult } from "@/types";

interface Props {
  result: QuizResult;
}

export function ResultsPage({ result }: Props) {
  const [email, setEmail] = useState("");
  const [wantReport, setWantReport] = useState(true);
  const [wantAlerts, setWantAlerts] = useState(true);
  const [wantCall, setWantCall] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasAnyCta = wantReport || wantAlerts || wantCall;
  const needsEmail = wantReport || wantAlerts;

  const gradeMessage = () => {
    if (result.totalSavingsPotential <= 0 && result.grade < 5) {
      return "Switching now may not be worth it after penalties. Holding to renewal could be the smarter move.";
    }
    if (result.grade === 5)
      return "You're in great shape. Stay the course and protect your savings.";
    if (result.grade >= 3)
      return "There's room to improve. A better rate could put real money back in your pocket.";
    return "You're paying more than you should. It's time to explore what's out there.";
  };

  const handleSubmit = async () => {
    if (needsEmail && !email.includes("@")) return;
    setSubmitting(true);

    const options = [
      wantReport && "report",
      wantAlerts && "alerts",
      wantCall && "call",
    ]
      .filter(Boolean)
      .join(",");

    try {
      await Promise.all([
        saveSubmission(result, email, options),
        needsEmail && sendReport(result, email, wantReport, wantAlerts),
        pushToZohoCRM(result, email, options.split(",")),
      ]);

      setSubmitted(true);

      if (wantCall) {
        // Open Calendly
        const w = window as any;
        if (w.Calendly) {
          w.Calendly.initPopupWidget({
            url: "https://calendly.com/flowmortgage/rate-review",
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in">
      {/* Grade card */}
      <div className="bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-6 md:p-8 shadow-xl mb-6">
        <p className="text-sm text-muted-foreground mb-1">
          {result.firstName}, here's your mortgage grade
        </p>

        <div className="flex items-center gap-4 mb-4">
          <StarRating grade={result.grade} size="lg" />
          <span className="text-lg font-semibold text-foreground">
            {result.grade} out of 5
          </span>
        </div>

        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          {gradeMessage()}
        </p>

        {/* Rate comparison */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-secondary/50 rounded-xl p-4 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Your rate</p>
            <p className="text-2xl font-bold text-foreground">
              {formatPercent(result.currentRate)}
            </p>
          </div>
          <div className="bg-primary/10 rounded-xl p-4 border border-primary/30">
            <p className="text-xs text-primary mb-1">Best available</p>
            <p className="text-2xl font-bold text-primary">
              {formatPercent(result.comparableRate)}
            </p>
          </div>
        </div>

        {/* Savings breakdown */}
        {result.yearlySavings > 0 && (
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-success" />
                <span className="text-sm text-foreground">Yearly savings</span>
              </div>
              <span className="text-lg font-bold text-success">
                {formatCurrency(result.yearlySavings)}
              </span>
            </div>

            {result.penalty > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    Est. penalty to break
                  </span>
                </div>
                <span className="text-sm font-semibold text-foreground">
                  {formatCurrency(result.penalty)}
                </span>
              </div>
            )}

            {result.breakevenMonths > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Break-even</span>
                </div>
                <span className="text-sm font-semibold text-foreground">
                  {result.breakevenMonths} month
                  {result.breakevenMonths !== 1 ? "s" : ""}
                </span>
              </div>
            )}

            {result.totalSavingsPotential > 0 && (
              <div className="flex items-center justify-between p-4 rounded-lg gradient-primary border border-primary/30">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-primary-foreground" />
                  <span className="text-sm font-medium text-primary-foreground">
                    Total savings potential
                  </span>
                </div>
                <span className="text-xl font-bold text-primary-foreground">
                  {formatCurrency(result.totalSavingsPotential)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Additional details */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-secondary/30 rounded-lg p-3 border border-border">
            <p className="text-xs text-muted-foreground mb-0.5">Renewal</p>
            <p className="font-medium text-foreground">
              {new Date(result.renewalDate).toLocaleDateString("en-CA", {
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-3 border border-border">
            <p className="text-xs text-muted-foreground mb-0.5">
              Better {result.paymentFrequency.toLowerCase()} payment
            </p>
            <p className="font-medium text-foreground">
              {result.comparablePayment > 0
                ? formatCurrency(result.comparablePayment)
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* CTA card */}
      {!submitted ? (
        <div className="bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-6 md:p-8 shadow-xl">
          <h3 className="text-lg font-bold text-foreground mb-4">
            What would you like to do?
          </h3>

          <div className="space-y-3 mb-5">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors">
              <Checkbox
                checked={wantReport}
                onCheckedChange={(c) => setWantReport(!!c)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Send me my results
                </p>
                <p className="text-xs text-muted-foreground">
                  Get the full breakdown via email
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors">
              <Checkbox
                checked={wantAlerts}
                onCheckedChange={(c) => setWantAlerts(!!c)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Notify me when rates drop
                </p>
                <p className="text-xs text-muted-foreground">
                  Get an email when switching makes sense
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors">
              <Checkbox
                checked={wantCall}
                onCheckedChange={(c) => setWantCall(!!c)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Book a free strategy call
                </p>
                <p className="text-xs text-muted-foreground">
                  Speak with a mortgage advisor about your options
                </p>
              </div>
            </label>
          </div>

          {needsEmail && (
            <div className="mb-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="your@email.com"
                className="w-full h-12 rounded-lg border border-border bg-input px-4 text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
              />
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!hasAnyCta || (needsEmail && !email.includes("@")) || submitting}
            size="xl"
            className="w-full"
          >
            {submitting ? "Sending..." : "Send"}{" "}
            <Send className="w-5 h-5" />
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-4 flex items-center justify-center gap-1.5">
            <Shield className="w-3 h-3" />
            No unwanted calls. No spam. Unsubscribe anytime.
          </p>
        </div>
      ) : (
        <div className="bg-card/80 backdrop-blur-sm border border-success/30 rounded-2xl p-6 md:p-8 shadow-xl text-center">
          <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6 text-success" />
          </div>
          <h3 className="text-lg font-bold text-foreground mb-2">
            You're all set!
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            {wantReport && "Check your inbox for your full report. "}
            {wantAlerts && "We'll notify you when rates drop. "}
            {wantCall && "Your booking is confirmed."}
          </p>

          <div className="flex flex-col gap-3">
            <a
              href="tel:604-262-3500"
              className="flex items-center justify-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <Phone className="w-4 h-4" />
              Questions? Call 604-262-3500
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
