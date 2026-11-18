"use client";

import React, { useMemo, useRef, useState } from "react";
import { Pillar, Profile, SectionHeaders } from "@/types/portfolio";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { FieldSlotButton } from "@/components/ui/ActionButtons";
import {
  ActionMenuButton,
  buildReorderMenuItems,
} from "@/components/ui/ActionMenuButton";
import { AdminModuleHeaderBar } from "@/components/admin/AdminModuleHeaderBar";
import {
  AdminMobileStepView,
  MobileStepItem,
  useStepNavigation,
} from "@/components/admin/AdminMobileStepView";
import { SortableTextRow } from "@/components/admin/SortableTextRow";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { AdminAlertBanner } from "@/components/admin/AdminAlertBanner";
import {
  isNetworkOffline,
  useOfflineStatus,
} from "@/components/pwa/OfflineManager";
import { MessageField, TextField } from "@/components/ui/fields";
import {
  announceBrandPortalStatus,
  useBrandPortalWorkspaceSync,
} from "@/lib/brandPortalStatus";
import { findDuplicateValues, swapArrayItem } from "@/lib/utils";
import { validateStoryDraft, validateSubject } from "@/lib/validation";
import { useValidationFollower } from "@/lib/validationFollow";
import { BookOpen, Plus, Save } from "lucide-react";

type StoryStep = 0 | 1 | 2;

const STORY_STEPS: readonly {
  step: StoryStep;
  code: string;
  shortTitle: string;
}[] = [
  { step: 0, code: "01", shortTitle: "Story" },
  { step: 1, code: "02", shortTitle: "Pillars" },
  { step: 2, code: "03", shortTitle: "Marquee" },
];

function classifyStoryErrorStep(errorMessage: string): StoryStep {
  const lower = errorMessage.toLowerCase();
  if (lower.includes("marquee") || lower.includes("statement ")) return 2;
  if (lower.includes("pillar")) return 1;
  return 0;
}

interface StoryMarqueeManagerProps {
  profile: Profile;
  sectionHeaders: SectionHeaders;
  pillars: Pillar[];
  marqueePrinciples: string[];
  onSave: (payload: {
    profile: Profile;
    sectionHeaders: SectionHeaders;
    pillars: Pillar[];
    marqueePrinciples: string[];
  }) => Promise<void>;
}

interface StorySnapshot {
  storyEyebrow: string;
  storyHeading: string;
  storyBody: string[];
  pillars: Pillar[];
  marqueePrinciples: string[];
}

function cloneStorySnapshot(snapshot: StorySnapshot): StorySnapshot {
  return {
    storyEyebrow: snapshot.storyEyebrow,
    storyHeading: snapshot.storyHeading,
    storyBody: [...snapshot.storyBody],
    pillars: snapshot.pillars.map((pillar) => ({ ...pillar })),
    marqueePrinciples: [...snapshot.marqueePrinciples],
  };
}

export function StoryMarqueeManager({
  profile,
  sectionHeaders,
  pillars,
  marqueePrinciples,
  onSave,
}: StoryMarqueeManagerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const { isOnline } = useOfflineStatus();
  const offline = !isOnline;
  const isMobileOrTablet = useMediaQuery("(max-width: 1023px)");
  const { activeStep, stepDirection, switchStep } =
    useStepNavigation<StoryStep>(0);
  const { followFirstInvalid, followNextInvalid } = useValidationFollower();

  const initialEyebrow =
    sectionHeaders.storyEyebrow || "01 / The Origin Narrative";

  const [savedBaseline, setSavedBaseline] = useState<StorySnapshot>(() =>
    cloneStorySnapshot({
      storyEyebrow: initialEyebrow,
      storyHeading: profile.storyHeading,
      storyBody: profile.storyBody,
      pillars,
      marqueePrinciples,
    })
  );

  const [storyEyebrow, setStoryEyebrow] = useState(savedBaseline.storyEyebrow);
  const [storyHeading, setStoryHeading] = useState(savedBaseline.storyHeading);
  const [storyBody, setStoryBody] = useState<string[]>(savedBaseline.storyBody);
  const [draftPillars, setDraftPillars] = useState<Pillar[]>(
    savedBaseline.pillars
  );
  const [draftMarquee, setDraftMarquee] = useState<string[]>(
    savedBaseline.marqueePrinciples
  );

  const [nextKeyId, setNextKeyId] = useState(1);
  const [storyIds, setStoryIds] = useState<string[]>(() =>
    profile.storyBody.map((_, i) => `story-init-${i}`)
  );
  const [pillarIds, setPillarIds] = useState<string[]>(() =>
    pillars.map((_, i) => `pillar-init-${i}`)
  );
  const [marqueeIds, setMarqueeIds] = useState<string[]>(() =>
    marqueePrinciples.map((_, i) => `marquee-init-${i}`)
  );

  const [newTicker, setNewTicker] = useState("");
  const [tickerFeedback, setTickerFeedback] = useState<string | null>(null);
  const [forceTouched, setForceTouched] = useState(false);
  const [validationBannerActive, setValidationBannerActive] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    variant: "primary" | "danger";
    action: () => Promise<void> | void;
  } | null>(null);

  const [savedSignature, setSavedSignature] = useState(() =>
    JSON.stringify(savedBaseline)
  );

  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        storyEyebrow,
        storyHeading,
        storyBody,
        pillars: draftPillars,
        marqueePrinciples: draftMarquee,
      }),
    [storyEyebrow, storyHeading, storyBody, draftPillars, draftMarquee]
  );

  const hasUnsavedChanges = currentSignature !== savedSignature;

  useBrandPortalWorkspaceSync({
    moduleId: "story",
    moduleLabel: "Story & Principles",
    hasUnsavedChanges,
    saving,
  });

  const liveValidation = useMemo(
    () =>
      validateStoryDraft({
        storyEyebrow,
        storyHeading,
        storyBody,
        pillars: draftPillars,
        marqueePrinciples: draftMarquee,
      }),
    [storyEyebrow, storyHeading, storyBody, draftPillars, draftMarquee]
  );

  const liveErrorsCount = liveValidation.errors.length;
  const stepHasError: Record<StoryStep, boolean> = {
    0: false,
    1: false,
    2: false,
  };
  if (forceTouched && liveErrorsCount > 0) {
    for (const err of liveValidation.errors) {
      stepHasError[classifyStoryErrorStep(err)] = true;
    }
  }
  const firstErrorStep: StoryStep | null =
    liveErrorsCount > 0
      ? classifyStoryErrorStep(liveValidation.errors[0])
      : null;

  const mobileSteps: MobileStepItem[] = STORY_STEPS.map((item) => ({
    code: item.code,
    shortTitle: item.shortTitle,
    hasError: stepHasError[item.step],
  }));

  const jumpToValidationIssue = (mode: "first" | "next") => {
    if (isMobileOrTablet && firstErrorStep !== null && !stepHasError[activeStep]) {
      switchStep(firstErrorStep);
    } else if (isMobileOrTablet && mode === "first" && firstErrorStep !== null) {
      switchStep(firstErrorStep);
    }
    window.requestAnimationFrame(() =>
      mode === "first"
        ? followFirstInvalid(formRef.current)
        : followNextInvalid(formRef.current)
    );
  };

  const activeErrorBanner =
    apiError ??
    (validationBannerActive && liveErrorsCount > 0
      ? liveValidation.errors[0]
      : null);

  const duplicatePillarCodes = useMemo(
    () => findDuplicateValues(draftPillars.map((pillar) => pillar.number)),
    [draftPillars]
  );
  const duplicatePillarTitles = useMemo(
    () => findDuplicateValues(draftPillars.map((pillar) => pillar.title)),
    [draftPillars]
  );
  const duplicateMarqueeItems = useMemo(
    () => findDuplicateValues(draftMarquee),
    [draftMarquee]
  );

  const handleAddParagraph = () => {
    const key = `story-${nextKeyId}`;
    setNextKeyId((n) => n + 1);
    setStoryBody((prev) => [...prev, "New origin narrative paragraph..."]);
    setStoryIds((prev) => [...prev, key]);
  };

  const handleMoveParagraph = (idx: number, direction: -1 | 1) => {
    setStoryBody((prev) => swapArrayItem(prev, idx, direction));
    setStoryIds((prev) => swapArrayItem(prev, idx, direction));
  };

  const handleRemoveParagraph = (idx: number) => {
    if (storyBody.length <= 1) return;
    setConfirmState({
      title: `Remove Story Paragraph ${String(idx + 1).padStart(2, "0")}?`,
      description:
        "This removes the narrative paragraph from your draft. Save & Publish to apply it live.",
      confirmLabel: "Remove Paragraph",
      variant: "danger",
      action: () => {
        setStoryBody((prev) => prev.filter((_, i) => i !== idx));
        setStoryIds((prev) => prev.filter((_, i) => i !== idx));
      },
    });
  };

  const handleAddPillar = () => {
    let candidate = draftPillars.length + 1;
    const existingCodes = new Set(
      draftPillars.map((pillar) => pillar.number.trim().toLowerCase())
    );
    while (existingCodes.has(String(candidate).padStart(2, "0"))) {
      candidate += 1;
    }
    const nextNum = String(candidate).padStart(2, "0");
    const key = `pillar-${nextKeyId}`;
    setNextKeyId((n) => n + 1);

    setDraftPillars((prev) => [
      ...prev,
      {
        number: nextNum,
        title: `Engineering Pillar ${nextNum}`,
        description: "Describe the architectural principle and impact.",
      },
    ]);
    setPillarIds((prev) => [...prev, key]);
  };

  const handleMovePillar = (idx: number, direction: -1 | 1) => {
    setDraftPillars((prev) => swapArrayItem(prev, idx, direction));
    setPillarIds((prev) => swapArrayItem(prev, idx, direction));
  };

  const handleRemovePillar = (idx: number) => {
    if (draftPillars.length <= 1) return;
    const label = draftPillars[idx]?.title || `Pillar #${idx + 1}`;
    setConfirmState({
      title: `Remove "${label}"?`,
      description:
        "This removes the core engineering pillar card from your draft.",
      confirmLabel: "Remove Pillar",
      variant: "danger",
      action: () => {
        setDraftPillars((prev) => prev.filter((_, i) => i !== idx));
        setPillarIds((prev) => prev.filter((_, i) => i !== idx));
      },
    });
  };

  const handleAddTicker = () => {
    const trimmed = newTicker.trim();
    const check = validateSubject(trimmed, {
      label: "New Statement",
      minLength: 3,
      maxLength: 60,
      required: true,
    });
    if (!check.valid) {
      setTickerFeedback(
        check.error || "Enter at least 3 characters before adding a statement."
      );
      return;
    }

    const exists = draftMarquee.some(
      (item) => item.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setTickerFeedback(
        `"${trimmed.toUpperCase()}" is already in the marquee list.`
      );
      return;
    }

    const key = `marquee-${nextKeyId}`;
    setNextKeyId((n) => n + 1);
    setDraftMarquee((prev) => [...prev, trimmed.toUpperCase()]);
    setMarqueeIds((prev) => [...prev, key]);
    setNewTicker("");
    setTickerFeedback(null);
  };

  const handleMoveTicker = (idx: number, direction: -1 | 1) => {
    setDraftMarquee((prev) => swapArrayItem(prev, idx, direction));
    setMarqueeIds((prev) => swapArrayItem(prev, idx, direction));
  };

  const handleRemoveTicker = (idx: number) => {
    if (draftMarquee.length <= 1) return;
    const statement = draftMarquee[idx] || "ticker statement";
    setConfirmState({
      title: "Remove Marquee Statement?",
      description: `Remove "${statement}" from the infinite principles ticker?`,
      confirmLabel: "Remove Statement",
      variant: "danger",
      action: () => {
        setDraftMarquee((prev) => prev.filter((_, i) => i !== idx));
        setMarqueeIds((prev) => prev.filter((_, i) => i !== idx));
      },
    });
  };

  const handleDiscardDraft = () => {
    setConfirmState({
      title: "Discard Unsaved Story & Principles Draft?",
      description:
        "This reverts Chapter 01 narrative paragraphs, engineering pillars, and marquee ticker statements back to the last published version.",
      confirmLabel: "Discard Changes",
      variant: "danger",
      action: () => {
        const restored = cloneStorySnapshot(savedBaseline);
        const seq = nextKeyId;
        setNextKeyId((n) => n + 1);
        setStoryEyebrow(restored.storyEyebrow);
        setStoryHeading(restored.storyHeading);
        setStoryBody(restored.storyBody);
        setDraftPillars(restored.pillars);
        setDraftMarquee(restored.marqueePrinciples);
        setStoryIds(restored.storyBody.map((_, i) => `story-r${seq}-${i}`));
        setPillarIds(restored.pillars.map((_, i) => `pillar-r${seq}-${i}`));
        setMarqueeIds(
          restored.marqueePrinciples.map((_, i) => `marquee-r${seq}-${i}`)
        );
        setNewTicker("");
        setTickerFeedback(null);
        setForceTouched(false);
        setValidationBannerActive(false);
        setApiError(null);
        announceBrandPortalStatus({
          tone: "synced",
          label: "Draft Discarded",
          detail: "Story & Principles reverted to saved state",
          durationMs: 2600,
        });
      },
    });
  };

  const executeSave = async () => {
    if (isNetworkOffline(isOnline)) {
      setApiError("You are offline. Reconnect to publish Story & Principles.");
      setConfirmState(null);
      announceBrandPortalStatus({
        tone: "offline",
        label: "Offline Mode",
        detail: "Reconnect before publishing Story & Principles",
        durationMs: 3600,
      });
      return;
    }

    const cleanedSnapshot: StorySnapshot = {
      storyEyebrow: storyEyebrow.trim(),
      storyHeading: storyHeading.trim(),
      storyBody: storyBody.map((item) => item.trim()),
      pillars: draftPillars.map((pillar) => ({
        number: pillar.number.trim(),
        title: pillar.title.trim(),
        description: pillar.description.trim(),
      })),
      marqueePrinciples: draftMarquee.map((item) => item.trim()),
    };

    setSaving(true);
    setApiError(null);
    announceBrandPortalStatus({
      tone: "saving",
      label: "Publishing...",
      detail: "Syncing Story & Principles live",
      durationMs: 0,
    });

    try {
      await onSave({
        profile: {
          ...profile,
          storyHeading: cleanedSnapshot.storyHeading,
          storyBody: cleanedSnapshot.storyBody,
        },
        sectionHeaders: {
          ...sectionHeaders,
          storyEyebrow: cleanedSnapshot.storyEyebrow,
        },
        pillars: cleanedSnapshot.pillars,
        marqueePrinciples: cleanedSnapshot.marqueePrinciples,
      });

      const cloned = cloneStorySnapshot(cleanedSnapshot);
      setStoryEyebrow(cloned.storyEyebrow);
      setStoryHeading(cloned.storyHeading);
      setStoryBody(cloned.storyBody);
      setDraftPillars(cloned.pillars);
      setDraftMarquee(cloned.marqueePrinciples);
      setSavedBaseline(cloned);
      setSavedSignature(JSON.stringify(cloned));
      setForceTouched(false);
      setValidationBannerActive(false);
      setApiError(null);
      setConfirmState(null);

      announceBrandPortalStatus({
        tone: "live",
        label: "Saved & Live!",
        detail: "Story, Pillars & Marquee published",
        durationMs: 3600,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save story changes.";
      setApiError(msg);
      announceBrandPortalStatus({
        tone: "error",
        label: "Publish Failed",
        detail: msg,
      });
      setConfirmState(null);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveValidation.valid) {
      setForceTouched(true);
      setValidationBannerActive(true);
      setApiError(null);
      announceBrandPortalStatus({
        tone: "error",
        label: "Check Fields",
        detail:
          liveValidation.errors[0] || "Review required Story & Marquee fields",
      });
      jumpToValidationIssue("first");
      return;
    }

    setValidationBannerActive(false);
    setApiError(null);
    setConfirmState({
      title: "Save & Publish Story & Principles?",
      description:
        "This publishes your updated Chapter 01 Origin Narrative, Core Pillars, and Infinite Marquee statements live.",
      confirmLabel: "Save & Publish",
      variant: "primary",
      action: executeSave,
    });
  };

  const storySectionNode = (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 border-b border-(--border-subtle) pb-3">
          <div className="flex items-center justify-between sm:justify-start gap-2.5">
            <h3 className="font-display text-lg sm:text-xl uppercase tracking-tight text-(--text-primary)">
              1. Chapter 01 — The Origin Narrative
            </h3>
            <StatusPill
              label={`${storyBody.length} ${storyBody.length === 1 ? "paragraph" : "paragraphs"}`}
              variant="neutral"
              size="xs"
            />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddParagraph}
            className="w-full sm:w-auto font-mono tracking-wider border-(--border-strong)"
          >
            <Plus className="w-3.5 h-3.5 text-(--text-accent)" aria-hidden="true" />
            <span>Add Paragraph</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            id="story-eyebrow"
            label="Section Eyebrow Label"
            value={storyEyebrow}
            onChange={setStoryEyebrow}
            placeholder="e.g. CH // 01 · The Origin Story"
            required
            minLength={3}
            maxLength={80}
            showCounter
            mono
            forceTouched={forceTouched}
            hint="Displayed above the Chapter 01 display heading."
          />

          <TextField
            id="story-heading"
            label="Story Main Display Heading"
            value={storyHeading}
            onChange={setStoryHeading}
            placeholder="e.g. From Curiosity to Complete Full-Stack Ownership."
            required
            minLength={6}
            maxLength={120}
            showCounter
            forceTouched={forceTouched}
            hint="Large editorial headline introducing your narrative."
          />
        </div>

        <div className="space-y-4">
          {storyBody.map((paragraph, idx) => (
            <div
              key={storyIds[idx] ?? idx}
              className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-(--radius-control) p-3.5 sm:p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase tracking-widest text-(--text-accent)">
                  Origin Segment #{idx + 1}
                </span>
                <ActionMenuButton
                  label={`Actions for Paragraph ${String(idx + 1).padStart(2, "0")}`}
                  size="compact"
                  items={buildReorderMenuItems({
                    index: idx,
                    total: storyBody.length,
                    onMoveUp: () => handleMoveParagraph(idx, -1),
                    onMoveDown: () => handleMoveParagraph(idx, 1),
                    removeLabel: "Remove Paragraph",
                    canRemove: storyBody.length > 1,
                    onRemove: () => handleRemoveParagraph(idx),
                  })}
                />
              </div>

              <MessageField
                id={`story-paragraph-${storyIds[idx] ?? idx}`}
                label={`Paragraph ${String(idx + 1).padStart(2, "0")}`}
                value={paragraph}
                onChange={(sanitized) => {
                  setStoryBody((prev) =>
                    prev.map((item, i) => (i === idx ? sanitized : item))
                  );
                }}
                placeholder="Write a concise narrative paragraph covering your technical ownership and execution..."
                rows={4}
                required
                minLength={20}
                maxLength={900}
                showCounter
                expandableOnMobile
                forceTouched={forceTouched}
              />
            </div>
          ))}
        </div>
      </div>
  );

  const pillarsSectionNode = (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 border-b border-(--border-subtle) pb-3">
          <div className="flex items-center justify-between sm:justify-start gap-2.5">
            <h3 className="font-display text-lg sm:text-xl uppercase tracking-tight text-(--text-primary)">
              2. Core Engineering &amp; Analytics Pillars
            </h3>
            <StatusPill
              label={`${draftPillars.length} ${draftPillars.length === 1 ? "pillar" : "pillars"}`}
              variant="neutral"
              size="xs"
            />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddPillar}
            className="w-full sm:w-auto font-mono tracking-wider border-(--border-strong)"
          >
            <Plus className="w-3.5 h-3.5 text-(--text-accent)" aria-hidden="true" />
            <span>Add Pillar</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {draftPillars.map((pillar, idx) => {
            const codeKey = pillar.number.trim().toLowerCase();
            const titleKey = pillar.title.trim().toLowerCase();
            const isCodeDup = codeKey !== "" && duplicatePillarCodes.has(codeKey);
            const isTitleDup =
              titleKey !== "" && duplicatePillarTitles.has(titleKey);

            return (
              <div
                key={pillarIds[idx] ?? idx}
                className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-(--radius-control) p-3.5 sm:p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-(--text-accent)">
                    Pillar Card #{idx + 1}
                  </span>
                  <ActionMenuButton
                    label={`Actions for Pillar #${idx + 1}`}
                    size="compact"
                    items={buildReorderMenuItems({
                      index: idx,
                      total: draftPillars.length,
                      onMoveUp: () => handleMovePillar(idx, -1),
                      onMoveDown: () => handleMovePillar(idx, 1),
                      removeLabel: "Remove Pillar",
                      canRemove: draftPillars.length > 1,
                      onRemove: () => handleRemovePillar(idx),
                    })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[125px_1fr] gap-3 items-start">
                  <TextField
                    id={`pillar-code-${pillarIds[idx] ?? idx}`}
                    label="Code"
                    value={pillar.number}
                    onChange={(val) => {
                      const cleaned = val.replace(/\s+/g, "").slice(0, 4);
                      setDraftPillars((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, number: cleaned } : item
                        )
                      );
                    }}
                    placeholder="01"
                    required
                    minLength={2}
                    maxLength={4}
                    mono
                    uppercase
                    forceTouched={forceTouched}
                    hint={
                      isCodeDup
                        ? "Duplicate code — change to make unique."
                        : undefined
                    }
                    inputClassName="text-center font-bold text-(--text-accent)"
                  />

                  <TextField
                    id={`pillar-title-${pillarIds[idx] ?? idx}`}
                    label="Pillar Title"
                    value={pillar.title}
                    onChange={(val) => {
                      setDraftPillars((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, title: val } : item
                        )
                      );
                    }}
                    placeholder="e.g. 100% Full-Stack Ownership"
                    required
                    minLength={3}
                    maxLength={80}
                    showCounter
                    forceTouched={forceTouched}
                    hint={
                      isTitleDup
                        ? "Duplicate title — rename to avoid repeating cards."
                        : undefined
                    }
                  />
                </div>

                <MessageField
                  id={`pillar-desc-${pillarIds[idx] ?? idx}`}
                  label={`Pillar #${idx + 1} Description`}
                  value={pillar.description}
                  onChange={(sanitized) => {
                    setDraftPillars((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, description: sanitized } : item
                      )
                    );
                  }}
                  placeholder="Describe how this engineering pillar drives scalability, clarity, or business outcomes..."
                  rows={3}
                  required
                  minLength={15}
                  maxLength={360}
                  showCounter
                  expandableOnMobile
                  forceTouched={forceTouched}
                />
              </div>
            );
          })}
        </div>
      </div>
  );

  const marqueeSectionNode = (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5 min-w-0">
        <div className="border-b border-(--border-subtle) pb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg sm:text-xl uppercase tracking-tight text-(--text-primary) min-w-0">
            3. Infinite Marquee Ticker Statements
          </h3>
          <StatusPill
            label={`${draftMarquee.length} ${draftMarquee.length === 1 ? "statement" : "statements"}`}
            variant="neutral"
            size="xs"
          />
        </div>

        <ScrollArea
          maxHeight={420}
          viewportClassName="grid grid-cols-1 lg:grid-cols-2 gap-4 pr-2 py-0.5 items-start"
        >
          {draftMarquee.map((statement, idx) => {
            const norm = statement.trim().toLowerCase();
            const isDup = norm !== "" && duplicateMarqueeItems.has(norm);
            const rowKey = marqueeIds[idx] ?? `marquee-${idx}`;

            return (
              <SortableTextRow
                key={rowKey}
                id={`marquee-statement-${rowKey}`}
                label={`Statement ${String(idx + 1).padStart(2, "0")}`}
                itemNoun="statement"
                removeLabel="Remove Statement"
                index={idx}
                totalCount={draftMarquee.length}
                value={statement}
                placeholder="E.G. ARCHITECT THE DATABASE"
                minLength={3}
                maxLength={60}
                showCounter
                mono
                uppercase
                forceTouched={forceTouched}
                hint={
                  isDup
                    ? "Duplicate statement — update or remove one copy."
                    : undefined
                }
                onChange={(val) => {
                  setDraftMarquee((prev) =>
                    prev.map((item, i) => (i === idx ? val : item))
                  );
                }}
                onMove={(dir) => handleMoveTicker(idx, dir === "up" ? -1 : 1)}
                onRemove={() => handleRemoveTicker(idx)}
              />
            );
          })}
        </ScrollArea>

        <div
          className="max-w-lg pt-3 border-t border-(--border-subtle)/60"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddTicker();
            }
          }}
        >
          <TextField
            id="story-new-ticker"
            label="Add New Marquee Statement"
            value={newTicker}
            onChange={(val) => {
              setNewTicker(val);
              if (tickerFeedback) setTickerFeedback(null);
            }}
            placeholder="E.G. ZERO-LAG UI ARCHITECTURE"
            required={false}
            minLength={3}
            maxLength={60}
            showCounter
            mono
            uppercase
            wrapRightSlotOnMobile
            hint={
              tickerFeedback ??
              "Press Enter or click Add Statement to append to the infinite ticker."
            }
            rightSlot={
              <FieldSlotButton
                onClick={handleAddTicker}
                className="w-full sm:w-auto justify-center"
              >
                <Plus
                  className="w-3.5 h-3.5 text-(--text-accent)"
                  aria-hidden="true"
                />
                <span>Add Statement</span>
              </FieldSlotButton>
            }
          />
        </div>
      </div>
  );

  const storyPanels = [storySectionNode, pillarsSectionNode, marqueeSectionNode];

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 sm:space-y-8"
    >
      {/* Header & Sticky Save Bar */}
      <AdminModuleHeaderBar
        icon={<BookOpen className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />}
        title="Story, 4 Pillars & Marquee Ticker"
        tooltipLabel="Story pillars & ticker rules"
        tooltipContent="Edit the multi-paragraph narrative, reorder the 4 architectural pillars, and curate marquee ticker statements before saving to publish."
        subtitle="Edit your origin narrative paragraphs, core engineering pillars, and infinite marquee statements."
        liveErrorsCount={liveErrorsCount}
        onFollowIssue={() => {
          setForceTouched(true);
          setValidationBannerActive(true);
          jumpToValidationIssue("next");
        }}
        hasUnsavedChanges={hasUnsavedChanges}
        onDiscard={handleDiscardDraft}
        saving={saving}
      />

      {offline && (
        <AdminAlertBanner
          variant="offline"
          message="You are offline."
          detail="Draft edits stay safe locally, but publishing Story & Principles requires an active connection."
        />
      )}

      {activeErrorBanner && (
        <AdminAlertBanner
          variant="error"
          message={apiError ? "Save Blocked:" : "Check Required Fields:"}
          detail={activeErrorBanner}
          actionLabel={liveErrorsCount > 0 ? "Follow Issue" : undefined}
          onAction={
            liveErrorsCount > 0
              ? () => {
                  setForceTouched(true);
                  jumpToValidationIssue("first");
                }
              : undefined
          }
          onDismiss={() => {
            setValidationBannerActive(false);
            setApiError(null);
          }}
        />
      )}

      {isMobileOrTablet ? (
        <AdminMobileStepView
          ariaLabel="Story and marquee sections"
          steps={mobileSteps}
          activeStep={activeStep}
          direction={stepDirection}
          onChangeStep={(next) => switchStep(next as StoryStep)}
          finalAction={{
            label: saving ? "Saving..." : "Save & Publish",
            type: "submit",
            variant: "primary",
            disabled: saving,
            icon: <Save className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
          }}
        >
          {storyPanels[activeStep] ?? storyPanels[0]}
        </AdminMobileStepView>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {storySectionNode}
          {pillarsSectionNode}
          {marqueeSectionNode}
        </div>
      )}

      <ConfirmModal
        open={Boolean(confirmState)}
        variant={confirmState?.variant || "primary"}
        title={confirmState?.title || ""}
        description={confirmState?.description || ""}
        confirmLabel={confirmState?.confirmLabel || "Confirm"}
        loading={saving}
        onCancel={() => {
          if (!saving) setConfirmState(null);
        }}
        onConfirm={async () => {
          if (!confirmState) return;
          const act = confirmState.action;
          await act();
          if (confirmState.variant === "danger") {
            setConfirmState(null);
          }
        }}
      />
    </form>
  );
}
