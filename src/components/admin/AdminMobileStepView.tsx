"use client";

import React, { useCallback, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { AdminSlideView } from "@/components/motion/AdminMotion";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { Button } from "@/components/ui/Button";
import { Tabs, TabItem } from "@/components/ui/Tabs";
import { measureStickyCeilingPx } from "@/lib/utils";

export interface MobileStepItem {
  code: string;
  shortTitle: string;
  ariaLabel?: string;
  hasError?: boolean;
}

export interface MobileStepFinalAction {
  label: string;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "outline";
  icon?: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}

export interface AdminMobileStepViewProps {
  ariaLabel?: string;
  steps: readonly MobileStepItem[];
  activeStep: number;
  direction: "forward" | "back";
  onChangeStep: (nextStep: number) => void;
  finalAction?: MobileStepFinalAction;
  children: React.ReactNode;
}

/**
 * Shared directional step state hook for mobile/tablet `< lg` multi-step workflows
 * across Profile, Story & Marquee, Skills & Impact, and Project Details.
 */
export function useStepNavigation<T extends number = number>(initialStep = 0 as T) {
  const [activeStep, setActiveStep] = useState<T>(initialStep);
  const [stepDirection, setStepDirection] = useState<"forward" | "back">(
    "forward"
  );

  const switchStep = useCallback((nextStep: T) => {
    setActiveStep((prev) => {
      if (nextStep === prev) return prev;
      setStepDirection(nextStep > prev ? "forward" : "back");
      return nextStep;
    });
  }, []);

  return { activeStep, stepDirection, switchStep };
}

/**
 * Shared mobile/tablet animated step-tab container:
 * - Renders `<Tabs size="dock" dockSurface="inline" />` with sidebar-matched bounce & error `!` badges.
 * - Slides active step panel horizontally via `AdminSlideView`.
 * - Renders zero-overflow bottom `Prev` / `Next` / final CTA buttons that smoothly re-frame
 *   the step header when advancing from the bottom of a long panel.
 */
export function AdminMobileStepView({
  ariaLabel = "Section steps",
  steps,
  activeStep,
  direction,
  onChangeStep,
  finalAction,
  children,
}: AdminMobileStepViewProps) {
  const { scrollTo } = useSmoothScroll();
  const stepStripRef = useRef<HTMLDivElement>(null);

  const handleNavigate = (nextStep: number, ensureVisible = false) => {
    if (nextStep === activeStep || nextStep < 0 || nextStep >= steps.length) {
      return;
    }
    onChangeStep(nextStep);

    if (ensureVisible && stepStripRef.current) {
      const rect = stepStripRef.current.getBoundingClientRect();
      const ceiling = measureStickyCeilingPx(76, 10);
      if (rect.top < ceiling) {
        scrollTo(stepStripRef.current, { offset: -(ceiling + 8) });
      }
    }
  };

  const tabItems: TabItem[] = steps.map((step, idx) => ({
    id: String(idx),
    label: step.shortTitle,
    ariaLabel: step.ariaLabel || `${step.code} ${step.shortTitle}`,
    icon: (
      <span className="font-mono text-[10px] leading-none opacity-85 block">
        {step.code}
      </span>
    ),
    ...(step.hasError ? { badge: "!", isAlertBadge: true } : {}),
  }));

  const nextStepMeta =
    activeStep + 1 < steps.length ? steps[activeStep + 1] : null;
  const fallbackFirst = activeStep > 0 ? steps[0] : null;

  return (
    <>
      <div ref={stepStripRef}>
        <Tabs
          ariaLabel={ariaLabel}
          items={tabItems}
          value={String(activeStep)}
          onChange={(nextVal) => handleNavigate(Number(nextVal), false)}
          size="dock"
          dockSurface="inline"
          layout="equal"
          variant="accent"
          className="w-full"
        />
      </div>

      <div className="overflow-x-clip">
        <AdminSlideView
          activeKey={`mobile-step-${activeStep}`}
          direction={direction}
          distancePx={28}
          skipInitial
        >
          {children}
        </AdminSlideView>
      </div>

      <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3 flex items-center gap-2.5">
        {activeStep > 0 && (
          <div className="flex-1 min-w-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              fullWidth
              onClick={() => handleNavigate(activeStep - 1, true)}
              className="h-10 px-3 font-mono text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Prev</span>
            </Button>
          </div>
        )}

        <div className="flex-1 min-w-0">
          {nextStepMeta ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => handleNavigate(activeStep + 1, true)}
              className="h-10 px-3 font-mono text-xs border-(--border-strong)"
            >
              <span className="truncate">
                Next: {nextStepMeta.code} {nextStepMeta.shortTitle}
              </span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </Button>
          ) : finalAction ? (
            <Button
              type={finalAction.type ?? "button"}
              variant={finalAction.variant ?? "primary"}
              size="sm"
              fullWidth
              disabled={finalAction.disabled}
              onClick={finalAction.onClick}
              className="h-10 px-3 font-mono text-xs"
            >
              {finalAction.icon}
              <span className="truncate">{finalAction.label}</span>
            </Button>
          ) : (
            fallbackFirst && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => handleNavigate(0, true)}
                aria-label={`Return to step ${fallbackFirst.code} ${fallbackFirst.shortTitle}`}
                className="h-10 px-3 font-mono text-xs border-(--border-strong)"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {fallbackFirst.code} {fallbackFirst.shortTitle}
                </span>
              </Button>
            )
          )}
        </div>
      </div>
    </>
  );
}
