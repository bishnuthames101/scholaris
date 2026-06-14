"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  School,
  Calendar,
  Users,
  Receipt,
  Rocket,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/client-api";

type OnboardingState = {
  completed: boolean;
  currentStep: number;
  steps: {
    schoolInfo: boolean;
    academicYear: boolean;
    students: boolean;
    fees: boolean;
    done: boolean;
  };
  counts: { academicYears: number; students: number; feeStructures: number };
};

const STEPS = [
  {
    key: "schoolInfo",
    title: "School Information",
    description: "Your school was created when the admin set up your account. You can update details in Settings.",
    icon: School,
    link: "/settings",
    linkLabel: "Go to Settings",
    doneLabel: "Account created",
  },
  {
    key: "academicYear",
    title: "Academic Year",
    description: "Set up your current academic year — all classes, enrollments, and exams are organized by academic year.",
    icon: Calendar,
    link: "/classes",
    linkLabel: "Set up Academic Year & Classes",
    doneLabel: "Academic year created",
  },
  {
    key: "students",
    title: "Import Students",
    description: "Add students individually or bulk-import from a CSV file. Assign them to classes and sections.",
    icon: Users,
    link: "/students",
    linkLabel: "Add or Import Students",
    doneLabel: (count: number) => `${count} students imported`,
  },
  {
    key: "fees",
    title: "Set Up Fees",
    description: "Define fee heads (tuition, transport, exam...) and create fee structures for each class. You can generate invoices once this is done.",
    icon: Receipt,
    link: "/fees",
    linkLabel: "Set Up Fee Structure",
    doneLabel: "Fee structures created",
  },
  {
    key: "done",
    title: "You're All Set!",
    description: "Your school is ready to use. Explore attendance, exams, messaging, and more from your dashboard.",
    icon: Rocket,
    link: "/dashboard",
    linkLabel: "Go to Dashboard",
    doneLabel: "Onboarding complete",
  },
] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    api<OnboardingState>("/api/onboarding")
      .then((r) => {
        setState(r.data);
        // Start at the first incomplete step
        if (r.data.completed) {
          router.replace("/dashboard");
          return;
        }
        const stepsArr = Object.values(r.data.steps);
        const firstIncomplete = stepsArr.findIndex((v) => !v);
        setActiveStep(firstIncomplete >= 0 ? firstIncomplete : 0);
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function markComplete() {
    await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    router.replace("/dashboard");
  }

  async function updateStep(step: number) {
    setActiveStep(step);
    await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentStep: step }),
    });
  }

  async function refresh() {
    const r = await api<OnboardingState>("/api/onboarding");
    setState(r.data);
  }

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const current = STEPS[activeStep];
  const stepKey = current.key as keyof typeof state.steps;
  const isStepDone = state.steps[stepKey];
  const isLastStep = activeStep === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Welcome to Scholaris
        </h1>
        <p className="mt-1 text-sm text-muted">
          Let&apos;s get your school set up in a few easy steps
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((step, i) => {
          const key = step.key as keyof typeof state.steps;
          const done = state.steps[key];
          const active = i === activeStep;

          return (
            <button
              key={step.key}
              onClick={() => updateStep(i)}
              className="flex items-center gap-2"
            >
              <div
                className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  done
                    ? "bg-success text-white"
                    : active
                      ? "bg-brand-600 text-white"
                      : "bg-surface-muted text-muted"
                }`}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`hidden h-0.5 w-8 sm:block ${done ? "bg-success" : "bg-border"}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Current step card */}
      <Card>
        <CardContent className="space-y-6 py-8">
          <div className="flex items-start gap-4">
            <div
              className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${
                isStepDone ? "bg-success-bg text-success" : "bg-brand-50 text-brand-600"
              }`}
            >
              <current.icon className="size-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">{current.title}</h2>
              <p className="mt-1 text-sm text-muted">{current.description}</p>
            </div>
          </div>

          {/* Status */}
          {isStepDone && !isLastStep && (
            <div className="flex items-center gap-2 rounded-lg bg-success-bg px-4 py-3 text-sm text-success">
              <Check className="size-4" />
              {typeof current.doneLabel === "function"
                ? current.doneLabel(
                    stepKey === "students" ? state.counts.students : 0,
                  )
                : current.doneLabel}
            </div>
          )}

          {/* Action */}
          <div className="flex flex-wrap items-center gap-3">
            {activeStep > 0 && (
              <Button variant="outline" onClick={() => updateStep(activeStep - 1)}>
                <ArrowLeft className="size-4" />
                Previous
              </Button>
            )}

            {!isLastStep && (
              <Button
                variant="outline"
                onClick={() => {
                  router.push(current.link);
                }}
              >
                {current.linkLabel}
                <ExternalLink className="size-3.5" />
              </Button>
            )}

            {!isLastStep ? (
              <Button
                onClick={async () => {
                  await refresh();
                  updateStep(activeStep + 1);
                }}
              >
                {isStepDone ? "Next Step" : "Skip for now"}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={markComplete}>
                <Rocket className="size-4" />
                Finish Setup
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Skip link */}
      {!isLastStep && (
        <p className="text-center text-xs text-muted">
          You can always come back to this wizard from{" "}
          <button
            className="text-brand-600 underline"
            onClick={markComplete}
          >
            skip to dashboard
          </button>
        </p>
      )}
    </div>
  );
}
