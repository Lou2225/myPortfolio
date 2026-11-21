"use client";

import React, { useMemo, useRef, useState } from "react";
import { Metric, SectionHeaders, SkillCategory } from "@/types/portfolio";
import { Button } from "@/components/ui/Button";
import {
  FieldSlotButton,
  IconActionButton,
} from "@/components/ui/ActionButtons";
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
import { SectionHeader } from "@/components/ui/SectionHeader";
import { InfoTooltip } from "@/components/ui/Tooltip";
import { AnimatedCounter } from "@/components/motion/AdminMotion";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
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
import {
  SECTION_HEADER_FIELD_RULES,
  validateMetricAffix,
  validateMetricValue,
  validateSkillName,
  validateSkillsImpactDraft,
} from "@/lib/validation";
import { useValidationFollower } from "@/lib/validationFollow";
import { Cpu, Plus, Star } from "lucide-react";

type SkillsStep = 0 | 1 | 2;

const SKILLS_STEPS: readonly {
  step: SkillsStep;
  code: string;
  shortTitle: string;
}[] = [
  { step: 0, code: "01", shortTitle: "Skills" },
  { step: 1, code: "02", shortTitle: "Metrics" },
  { step: 2, code: "03", shortTitle: "Headers" },
];

const SECTION_HEADER_LABELS = SECTION_HEADER_FIELD_RULES.map((rule) =>
  rule.label.toLowerCase()
);

function classifySkillsErrorStep(errorMessage: string): SkillsStep {
  const lower = errorMessage.toLowerCase();
  if (
    lower.includes("counter #") ||
    lower.includes("impact metric") ||
    lower.includes("metric title")
  ) {
    return 1;
  }
  if (
    lower.includes("category") ||
    lower.includes("bento") ||
    lower.includes("eyebrow tag") ||
    lower.includes("skill entry") ||
    lower.includes(" · skill ") ||
    lower.includes("is duplicated in")
  ) {
    return 0;
  }
  if (SECTION_HEADER_LABELS.some((label) => lower.includes(label))) {
    return 2;
  }
  return 0;
}

interface SkillsImpactManagerProps {
  skills: SkillCategory[];
  impactMetrics: Metric[];
  sectionHeaders: SectionHeaders;
  onSave: (payload: {
    skills: SkillCategory[];
    impactMetrics: Metric[];
    sectionHeaders: SectionHeaders;
  }) => Promise<void>;
}

interface SkillsImpactSnapshot {
  skills: SkillCategory[];
  impactMetrics: Metric[];
  sectionHeaders: SectionHeaders;
}

function cloneSkillsImpactSnapshot(
  snapshot: SkillsImpactSnapshot
): SkillsImpactSnapshot {
  return {
    skills: snapshot.skills.map((category) => ({
      ...category,
      skills: category.skills.map((skill) => ({ ...skill })),
    })),
    impactMetrics: snapshot.impactMetrics.map((metric) => ({ ...metric })),
    sectionHeaders: { ...snapshot.sectionHeaders },
  };
}

function buildInitialSkillIds(
  categories: SkillCategory[],
  prefix = "init"
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const cat of categories) {
    map[cat.id] = cat.skills.map((_, i) => `skill-${cat.id}-${prefix}-${i}`);
  }
  return map;
}

export function SkillsImpactManager({
  skills,
  impactMetrics,
  sectionHeaders,
  onSave,
}: SkillsImpactManagerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const { isOnline } = useOfflineStatus();
  const isMobileOrTablet = useMediaQuery("(max-width: 1023px)");
  const { activeStep, stepDirection, switchStep } =
    useStepNavigation<SkillsStep>(0);
  const { followFirstInvalid, followNextInvalid } = useValidationFollower();

  const [savedBaseline, setSavedBaseline] = useState<SkillsImpactSnapshot>(() =>
    cloneSkillsImpactSnapshot({ skills, impactMetrics, sectionHeaders })
  );

  const [draftSkills, setDraftSkills] = useState<SkillCategory[]>(
    savedBaseline.skills
  );
  const [draftMetrics, setDraftMetrics] = useState<Metric[]>(
    savedBaseline.impactMetrics
  );
  const [draftHeaders, setDraftHeaders] = useState<SectionHeaders>(
    savedBaseline.sectionHeaders
  );

  const [nextKeyId, setNextKeyId] = useState(1);
  const [skillIdsByCat, setSkillIdsByCat] = useState<Record<string, string[]>>(
    () => buildInitialSkillIds(skills)
  );
  const [metricIds, setMetricIds] = useState<string[]>(() =>
    impactMetrics.map((_, i) => `metric-init-${i}`)
  );

  const [newSkillNames, setNewSkillNames] = useState<Record<string, string>>({});
  const [skillFeedbacks, setSkillFeedbacks] = useState<
    Record<string, string | null>
  >({});

  const [forceTouched, setForceTouched] = useState(false);
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
        skills: draftSkills,
        impactMetrics: draftMetrics,
        sectionHeaders: draftHeaders,
      }),
    [draftSkills, draftMetrics, draftHeaders]
  );

  const hasUnsavedChanges = currentSignature !== savedSignature;

  const liveValidation = useMemo(
    () =>
      validateSkillsImpactDraft({
        skills: draftSkills,
        impactMetrics: draftMetrics,
        sectionHeaders: draftHeaders,
      }),
    [draftSkills, draftMetrics, draftHeaders]
  );

  const liveErrorsCount = liveValidation.errors.length;
  const stepHasError: Record<SkillsStep, boolean> = {
    0: false,
    1: false,
    2: false,
  };
  if (forceTouched && liveErrorsCount > 0) {
    for (const err of liveValidation.errors) {
      stepHasError[classifySkillsErrorStep(err)] = true;
    }
  }
  const firstErrorStep: SkillsStep | null =
    liveErrorsCount > 0
      ? classifySkillsErrorStep(liveValidation.errors[0])
      : null;

  const mobileSteps: MobileStepItem[] = SKILLS_STEPS.map((item) => ({
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

  const duplicateCategoryTitles = useMemo(
    () => findDuplicateValues(draftSkills.map((category) => category.title)),
    [draftSkills]
  );
  const duplicateMetricLabels = useMemo(
    () => findDuplicateValues(draftMetrics.map((metric) => metric.label)),
    [draftMetrics]
  );

  const handleMoveCategory = (catIdx: number, direction: -1 | 1) => {
    setDraftSkills((prev) => swapArrayItem(prev, catIdx, direction));
  };

  const handleAddSkillToCategory = (catIdx: number) => {
    const category = draftSkills[catIdx];
    if (!category) return;

    const raw = (newSkillNames[category.id] || "").trim();
    const check = validateSkillName(raw, "New Skill");
    if (!check.valid) {
      setSkillFeedbacks((prev) => ({
        ...prev,
        [category.id]: check.error || "Enter a skill name first.",
      }));
      return;
    }

    const exists = category.skills.some(
      (skill) => skill.name.trim().toLowerCase() === raw.toLowerCase()
    );
    if (exists) {
      setSkillFeedbacks((prev) => ({
        ...prev,
        [category.id]: `"${raw}" already exists in this layer.`,
      }));
      return;
    }

    const key = `skill-${category.id}-${nextKeyId}`;
    setNextKeyId((n) => n + 1);

    setDraftSkills((prev) => {
      const next = [...prev];
      next[catIdx] = {
        ...next[catIdx],
        skills: [
          ...next[catIdx].skills,
          { name: raw, level: "Core", highlight: false },
        ],
      };
      return next;
    });
    setSkillIdsByCat((prev) => ({
      ...prev,
      [category.id]: [...(prev[category.id] || []), key],
    }));
    setNewSkillNames((prev) => ({ ...prev, [category.id]: "" }));
    setSkillFeedbacks((prev) => ({ ...prev, [category.id]: null }));
  };

  const handleToggleSkillHighlight = (catIdx: number, skillIdx: number) => {
    setDraftSkills((prev) => {
      const next = [...prev];
      const nextSkills = [...next[catIdx].skills];
      nextSkills[skillIdx] = {
        ...nextSkills[skillIdx],
        highlight: !nextSkills[skillIdx].highlight,
      };
      next[catIdx] = { ...next[catIdx], skills: nextSkills };
      return next;
    });
  };

  const handleMoveSkill = (
    catIdx: number,
    skillIdx: number,
    direction: -1 | 1
  ) => {
    const category = draftSkills[catIdx];
    if (!category) return;
    setDraftSkills((prev) => {
      const next = [...prev];
      next[catIdx] = {
        ...next[catIdx],
        skills: swapArrayItem(next[catIdx].skills, skillIdx, direction),
      };
      return next;
    });
    setSkillIdsByCat((prev) => ({
      ...prev,
      [category.id]: swapArrayItem(
        prev[category.id] || category.skills.map((_, i) => String(i)),
        skillIdx,
        direction
      ),
    }));
  };

  const handleRemoveSkillFromCategory = (catIdx: number, skillIdx: number) => {
    const category = draftSkills[catIdx];
    if (!category || category.skills.length <= 1) return;
    const skillName = category.skills[skillIdx]?.name || "this skill";

    setConfirmState({
      title: `Remove "${skillName}"?`,
      description:
        "This removes the skill entry from this Bento category in your draft.",
      confirmLabel: "Remove Skill",
      variant: "danger",
      action: () => {
        setDraftSkills((prev) => {
          const next = [...prev];
          next[catIdx] = {
            ...next[catIdx],
            skills: next[catIdx].skills.filter((_, i) => i !== skillIdx),
          };
          return next;
        });
        setSkillIdsByCat((prev) => ({
          ...prev,
          [category.id]: (prev[category.id] || []).filter(
            (_, i) => i !== skillIdx
          ),
        }));
      },
    });
  };

  const handleAddMetric = () => {
    const num = draftMetrics.length + 1;
    const key = `metric-${nextKeyId}`;
    setNextKeyId((n) => n + 1);
    setDraftMetrics((prev) => [
      ...prev,
      {
        value: "100",
        suffix: "%",
        label: `Metric Counter ${String(num).padStart(2, "0")}`,
        description: "Describe what this number proves.",
      },
    ]);
    setMetricIds((prev) => [...prev, key]);
  };

  const handleMoveMetric = (idx: number, direction: -1 | 1) => {
    setDraftMetrics((prev) => swapArrayItem(prev, idx, direction));
    setMetricIds((prev) => swapArrayItem(prev, idx, direction));
  };

  const handleRemoveMetric = (idx: number) => {
    if (draftMetrics.length <= 1) return;
    const label = draftMetrics[idx]?.label || `Metric #${idx + 1}`;
    setConfirmState({
      title: `Remove "${label}"?`,
      description:
        "This deletes the animated KPI metric counter from your draft.",
      confirmLabel: "Remove Counter",
      variant: "danger",
      action: () => {
        setDraftMetrics((prev) => prev.filter((_, i) => i !== idx));
        setMetricIds((prev) => prev.filter((_, i) => i !== idx));
      },
    });
  };

  const handleDiscardDraft = () => {
    setConfirmState({
      title: "Discard Unsaved Skills & Metrics Draft?",
      description:
        "This reverts your Skills Bento categories, KPI impact counters, and global section headers back to the last published version.",
      confirmLabel: "Discard Changes",
      variant: "danger",
      action: () => {
        const restored = cloneSkillsImpactSnapshot(savedBaseline);
        const seq = nextKeyId;
        setNextKeyId((n) => n + 1);
        setDraftSkills(restored.skills);
        setDraftMetrics(restored.impactMetrics);
        setDraftHeaders(restored.sectionHeaders);
        setSkillIdsByCat(buildInitialSkillIds(restored.skills, `r${seq}`));
        setMetricIds(
          restored.impactMetrics.map((_, i) => `metric-r${seq}-${i}`)
        );
        setNewSkillNames({});
        setSkillFeedbacks({});
        setForceTouched(false);
        announceBrandPortalStatus({
          tone: "synced",
          label: "Draft Discarded",
          detail: "Skills & Metrics reverted to saved state",
          durationMs: 2600,
        });
      },
    });
  };

  const executeSave = async () => {
    if (isNetworkOffline(isOnline)) {
      setConfirmState(null);
      announceBrandPortalStatus({
        tone: "offline",
        label: "Offline Mode",
        detail: "Reconnect before publishing Skills & Metrics",
        durationMs: 3600,
      });
      return;
    }

    const cleanedSnapshot: SkillsImpactSnapshot = {
      skills: draftSkills.map((category) => ({
        ...category,
        eyebrow: category.eyebrow.trim(),
        title: category.title.trim(),
        description: category.description.trim(),
        skills: category.skills.map((skill) => ({
          ...skill,
          name: skill.name.trim(),
        })),
      })),
      impactMetrics: draftMetrics.map((metric) => ({
        value: metric.value.trim(),
        ...(metric.prefix?.trim() ? { prefix: metric.prefix } : {}),
        ...(metric.suffix?.trim() ? { suffix: metric.suffix } : {}),
        label: metric.label.trim(),
        description: metric.description.trim(),
      })),
      sectionHeaders: SECTION_HEADER_FIELD_RULES.reduce<SectionHeaders>(
        (acc, rule) => {
          acc[rule.key] = (draftHeaders[rule.key] || "").trim();
          return acc;
        },
        { ...draftHeaders }
      ),
    };

    setSaving(true);
    announceBrandPortalStatus({
      tone: "saving",
      label: "Publishing...",
      detail: "Syncing Skills Bento & Metrics live",
      durationMs: 0,
    });

    try {
      await onSave(cleanedSnapshot);

      const cloned = cloneSkillsImpactSnapshot(cleanedSnapshot);
      setDraftSkills(cloned.skills);
      setDraftMetrics(cloned.impactMetrics);
      setDraftHeaders(cloned.sectionHeaders);
      setSavedBaseline(cloned);
      setSavedSignature(JSON.stringify(cloned));
      setForceTouched(false);
      setConfirmState(null);

      announceBrandPortalStatus({
        tone: "live",
        label: "Saved & Live!",
        detail: "Skills Bento & KPI counters live",
        durationMs: 3600,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save skills & KPIs.";
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
      announceBrandPortalStatus({
        tone: "error",
        label: "Check Fields",
        detail:
          liveValidation.errors[0] ||
          "Review required Skills & Impact fields",
      });
      jumpToValidationIssue("first");
      return;
    }

    setConfirmState({
      title: "Save & Publish Skills, Metrics & Headers?",
      description:
        "This immediately publishes your updated Technical Arsenal, KPI Counters, and Chapter Headlines live.",
      confirmLabel: "Save & Publish",
      variant: "primary",
      action: executeSave,
    });
  };

  useBrandPortalWorkspaceSync({
    moduleId: "skills",
    moduleLabel: "Skills & Metrics",
    hasUnsavedChanges,
    saving,
    validationErrorCount: hasUnsavedChanges ? liveErrorsCount : 0,
    onSave: () => formRef.current?.requestSubmit(),
    onDiscard: handleDiscardDraft,
    onFollowIssue: () => {
      setForceTouched(true);
      jumpToValidationIssue("next");
    },
  });

  const skillsSectionNode = (
    <div className="space-y-6">
        <SectionHeader
          eyebrow="Chapter 02"
          title="1. Technical Arsenal (Bento Categories)"
          size="sm"
          rightSlot={
            <InfoTooltip
              label="Technical arsenal layers & core stars"
              content="Starred skills highlight primary capabilities inside each bento layer without changing grid layout."
            />
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {draftSkills.map((category, catIdx) => {
            const isCatTitleDup =
              category.title.trim() !== "" &&
              duplicateCategoryTitles.has(category.title.trim().toLowerCase());
            const duplicateSkillNames = findDuplicateValues(
              category.skills.map((skill) => skill.name)
            );
            const catSkillIds = skillIdsByCat[category.id] || [];
            const addValue = newSkillNames[category.id] || "";
            const addFeedback = skillFeedbacks[category.id];

            return (
              <div
                key={category.id}
                className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-5 space-y-4 min-w-0"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-(--border-subtle)">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono uppercase tracking-widest text-(--text-accent)">
                      Bento Layer #{catIdx + 1}
                    </span>
                    <span className="text-[11px] font-mono text-(--text-muted) tabular-nums">
                      · {category.skills.length} skills
                    </span>
                  </div>

                  <ActionMenuButton
                    label={`Actions for Bento Layer #${catIdx + 1}`}
                    size="compact"
                    items={buildReorderMenuItems({
                      index: catIdx,
                      total: draftSkills.length,
                      onMoveUp: () => handleMoveCategory(catIdx, -1),
                      onMoveDown: () => handleMoveCategory(catIdx, 1),
                    })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">
                  <TextField
                    id={`cat-${category.id}-eyebrow`}
                    label="Eyebrow Tag"
                    value={category.eyebrow}
                    onChange={(eyebrow) => {
                      setDraftSkills((prev) =>
                        prev.map((item, i) =>
                          i === catIdx ? { ...item, eyebrow } : item
                        )
                      );
                    }}
                    placeholder="e.g. Layer 01 / Foundation"
                    required
                    minLength={3}
                    maxLength={50}
                    showCounter
                    mono
                    forceTouched={forceTouched}
                  />

                  <TextField
                    id={`cat-${category.id}-title`}
                    label="Category Title"
                    value={category.title}
                    onChange={(title) => {
                      setDraftSkills((prev) =>
                        prev.map((item, i) =>
                          i === catIdx ? { ...item, title } : item
                        )
                      );
                    }}
                    placeholder="e.g. Database & Data Architecture"
                    required
                    minLength={3}
                    maxLength={60}
                    showCounter
                    forceTouched={forceTouched}
                    hint={
                      isCatTitleDup
                        ? "Duplicate category title — keep each layer distinct."
                        : undefined
                    }
                  />
                </div>

                <MessageField
                  id={`cat-${category.id}-description`}
                  label="Category Description"
                  value={category.description}
                  onChange={(description) => {
                    setDraftSkills((prev) =>
                      prev.map((item, i) =>
                        i === catIdx ? { ...item, description } : item
                      )
                    );
                  }}
                  placeholder="Describe this technical architecture layer..."
                  rows={2}
                  required
                  minLength={10}
                  maxLength={240}
                  showCounter
                  expandableOnMobile
                  forceTouched={forceTouched}
                />

                {/* Skills List using Reusable TextField, ActionButtons & ScrollArea */}
                <div className="space-y-3 pt-2 border-t border-(--border-subtle)">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-(--text-muted)">
                      Skills & Badges ({category.skills.length})
                    </span>
                    <span className="text-[10px] font-mono text-(--text-muted) flex items-center gap-1">
                      <Star
                        className="w-3 h-3 text-(--text-accent) fill-current"
                        aria-hidden="true"
                      />
                      <span>= Accent Red</span>
                    </span>
                  </div>

                  <ScrollArea
                    maxHeight={290}
                    viewportClassName="space-y-3 pr-2 py-0.5"
                  >
                    {category.skills.map((skill, skillIdx) => {
                      const norm = skill.name.trim().toLowerCase();
                      const isSkillDup =
                        norm !== "" && duplicateSkillNames.has(norm);
                      const skillKey = catSkillIds[skillIdx] ?? `${skillIdx}`;

                      return (
                        <SortableTextRow
                          key={skillKey}
                          id={`skill-${category.id}-${skillKey}`}
                          label={`Skill ${String(skillIdx + 1).padStart(2, "0")}`}
                          itemNoun="skill"
                          removeLabel="Remove Skill"
                          index={skillIdx}
                          totalCount={category.skills.length}
                          value={skill.name}
                          placeholder="e.g. PostgreSQL"
                          minLength={1}
                          maxLength={60}
                          forceTouched={forceTouched}
                          hint={
                            isSkillDup
                              ? "Duplicate skill in this category."
                              : undefined
                          }
                          validate={(val) =>
                            validateSkillName(
                              val,
                              `Skill ${String(skillIdx + 1).padStart(2, "0")}`
                            )
                          }
                          onChange={(name) => {
                            setDraftSkills((prev) => {
                              const next = [...prev];
                              const nextSkills = [...next[catIdx].skills];
                              nextSkills[skillIdx] = {
                                ...nextSkills[skillIdx],
                                name,
                              };
                              next[catIdx] = {
                                ...next[catIdx],
                                skills: nextSkills,
                              };
                              return next;
                            });
                          }}
                          onMove={(dir) =>
                            handleMoveSkill(
                              catIdx,
                              skillIdx,
                              dir === "up" ? -1 : 1
                            )
                          }
                          onRemove={() =>
                            handleRemoveSkillFromCategory(catIdx, skillIdx)
                          }
                          inlineActionSlot={
                            <IconActionButton
                              label={
                                skill.highlight
                                  ? `Remove accent highlight from ${skill.name || "skill"}`
                                  : `Highlight ${skill.name || "skill"} in accent color`
                              }
                              size="field"
                              onClick={() =>
                                handleToggleSkillHighlight(catIdx, skillIdx)
                              }
                              className={
                                skill.highlight
                                  ? "border-brand/55 bg-(--bg-badge-highlight) text-(--text-accent)"
                                  : undefined
                              }
                              icon={
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    skill.highlight ? "fill-current" : ""
                                  }`}
                                  aria-hidden="true"
                                />
                              }
                            />
                          }
                        />
                      );
                    })}
                  </ScrollArea>

                  <div
                    className="pt-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSkillToCategory(catIdx);
                      }
                    }}
                  >
                    <TextField
                      id={`cat-${category.id}-add-skill`}
                      label="Add Skill to Layer"
                      value={addValue}
                      onChange={(val) => {
                        setNewSkillNames((prev) => ({
                          ...prev,
                          [category.id]: val,
                        }));
                        if (addFeedback) {
                          setSkillFeedbacks((prev) => ({
                            ...prev,
                            [category.id]: null,
                          }));
                        }
                      }}
                      placeholder="e.g. Docker / Prisma ORM"
                      required={false}
                      minLength={1}
                      maxLength={60}
                      showCounter
                      wrapRightSlotOnMobile
                      validate={(val) =>
                        val.trim()
                          ? validateSkillName(val, "New Skill")
                          : { valid: true }
                      }
                      hint={
                        addFeedback ??
                        "Press Enter or click Add Skill to append to this layer."
                      }
                      rightSlot={
                        <FieldSlotButton
                          onClick={() => handleAddSkillToCategory(catIdx)}
                          className="w-full sm:w-auto justify-center"
                        >
                          <Plus
                            className="w-3.5 h-3.5 text-(--text-accent)"
                            aria-hidden="true"
                          />
                          <span>Add Skill</span>
                        </FieldSlotButton>
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
  );

  const metricsSectionNode = (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5 min-w-0">
        <SectionHeader
          eyebrow="Chapter 04"
          title="2. Impact Metrics (Animated Counters)"
          size="sm"
          withDivider
          stackRightOnMobile
          rightSlot={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddMetric}
              className="w-full sm:w-auto font-mono tracking-wider border-(--border-strong)"
            >
              <Plus
                className="w-3.5 h-3.5 text-(--text-accent)"
                aria-hidden="true"
              />
              <span>Add Counter</span>
            </Button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {draftMetrics.map((metric, idx) => {
            const metricKey = metricIds[idx] ?? `${idx}`;
            const trimmedValue = metric.value.trim();
            const isPureNumber = /^\d+(\.\d+)?$/.test(trimmedValue);
            const isMetricDup =
              metric.label.trim() !== "" &&
              duplicateMetricLabels.has(metric.label.trim().toLowerCase());

            return (
              <div
                key={metricKey}
                className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-(--radius-control) p-3.5 sm:p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-(--border-subtle)">
                  <div className="flex items-baseline gap-3 min-w-0">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-(--text-muted) shrink-0">
                      Counter #{idx + 1}
                    </span>
                    <span className="font-display text-2xl text-(--text-accent) truncate">
                      {isPureNumber ? (
                        <AnimatedCounter
                          value={Number(trimmedValue)}
                          prefix={metric.prefix || ""}
                          suffix={metric.suffix || ""}
                          durationMs={900 + idx * 80}
                        />
                      ) : (
                        <>
                          {metric.prefix || ""}
                          {metric.value}
                          {metric.suffix || ""}
                        </>
                      )}
                    </span>
                  </div>

                  <ActionMenuButton
                    label={`Actions for Counter #${idx + 1}`}
                    size="compact"
                    items={buildReorderMenuItems({
                      index: idx,
                      total: draftMetrics.length,
                      onMoveUp: () => handleMoveMetric(idx, -1),
                      onMoveDown: () => handleMoveMetric(idx, 1),
                      removeLabel: "Remove Counter",
                      canRemove: draftMetrics.length > 1,
                      onRemove: () => handleRemoveMetric(idx),
                    })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                  <TextField
                    id={`metric-prefix-${metricKey}`}
                    label="Prefix"
                    value={metric.prefix || ""}
                    onChange={(prefix) => {
                      setDraftMetrics((prev) =>
                        prev.map((item, i) =>
                          i === idx
                            ? {
                                ...item,
                                prefix: prefix === "" ? undefined : prefix,
                              }
                            : item
                        )
                      );
                    }}
                    validate={(val) =>
                      validateMetricAffix(val, `Counter #${idx + 1} Prefix`)
                    }
                    required={false}
                    maxLength={12}
                    mono
                    trimOnBlur={false}
                    placeholder="e.g. $"
                    forceTouched={forceTouched}
                  />

                  <TextField
                    id={`metric-value-${metricKey}`}
                    label="Value"
                    value={metric.value}
                    onChange={(value) => {
                      setDraftMetrics((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, value } : item
                        )
                      );
                    }}
                    validate={(val) =>
                      validateMetricValue(val, `Counter #${idx + 1} Value`)
                    }
                    required
                    minLength={1}
                    maxLength={12}
                    mono
                    placeholder="100"
                    inputClassName="font-bold text-(--text-accent)"
                    forceTouched={forceTouched}
                  />

                  <TextField
                    id={`metric-suffix-${metricKey}`}
                    label="Suffix"
                    value={metric.suffix || ""}
                    onChange={(suffix) => {
                      setDraftMetrics((prev) =>
                        prev.map((item, i) =>
                          i === idx
                            ? {
                                ...item,
                                suffix: suffix === "" ? undefined : suffix,
                              }
                            : item
                        )
                      );
                    }}
                    validate={(val) =>
                      validateMetricAffix(val, `Counter #${idx + 1} Suffix`)
                    }
                    required={false}
                    maxLength={12}
                    mono
                    trimOnBlur={false}
                    placeholder="%, +, FPS"
                    forceTouched={forceTouched}
                  />
                </div>

                <TextField
                  id={`metric-label-${metricKey}`}
                  label="Metric Title"
                  value={metric.label}
                  onChange={(label) => {
                    setDraftMetrics((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, label } : item
                      )
                    );
                  }}
                  placeholder="e.g. Full-Stack Ownership"
                  required
                  minLength={3}
                  maxLength={60}
                  showCounter
                  forceTouched={forceTouched}
                  hint={
                    isMetricDup
                      ? "Duplicate metric title — differentiate counter titles."
                      : undefined
                  }
                />

                <MessageField
                  id={`metric-desc-${metricKey}`}
                  label={`Counter #${idx + 1} Description`}
                  value={metric.description}
                  onChange={(description) => {
                    setDraftMetrics((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, description } : item
                      )
                    );
                  }}
                  placeholder="Explain what this metric proves about your engineering execution..."
                  rows={2}
                  required
                  minLength={10}
                  maxLength={220}
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

  const headersSectionNode = (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5 min-w-0">
        <SectionHeader
          eyebrow="Global Copy"
          title="3. Section Headings, Subtitles & Footer Copy"
          size="sm"
          withDivider
          rightSlot={
            <InfoTooltip
              label="Global section headings & footer labels"
              content="Edits eyebrows, section titles, subtitles, and footer text labels live across the public portfolio without touching code."
            />
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {SECTION_HEADER_FIELD_RULES.map((rule) => (
            <TextField
              key={rule.key}
              id={`section-header-${rule.key}`}
              label={rule.label}
              value={draftHeaders[rule.key] || ""}
              onChange={(val) =>
                setDraftHeaders((prev) => ({
                  ...prev,
                  [rule.key]: val,
                }))
              }
              placeholder={rule.placeholder}
              required
              minLength={rule.minLength}
              maxLength={rule.maxLength}
              showCounter
              mono={Boolean(rule.mono)}
              forceTouched={forceTouched}
            />
          ))}
        </div>
      </div>
  );

  const skillsPanels = [
    skillsSectionNode,
    metricsSectionNode,
    headersSectionNode,
  ];

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 sm:space-y-8"
    >
      {/* Clean Module Header */}
      <AdminModuleHeaderBar
        icon={<Cpu className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />}
        title="Skills Bento, Impact Metrics & Section Headers"
        tooltipLabel="Skills, metrics & copy editor guide"
        tooltipContent="Curate core/secondary skills across all 4 system layers, reorder animated KPI counters, and customize section eyebrows, headings, and footer copy globally."
        subtitle="Manage your 4-layer technical arsenal, animated KPI counters, and section titles across the site."
      />

      {isMobileOrTablet ? (
        <AdminMobileStepView
          ariaLabel="Skills, impact metrics, and section header steps"
          steps={mobileSteps}
          activeStep={activeStep}
          direction={stepDirection}
          onChangeStep={(next) => switchStep(next as SkillsStep)}
        >
          {skillsPanels[activeStep] ?? skillsPanels[0]}
        </AdminMobileStepView>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {skillsSectionNode}
          {metricsSectionNode}
          {headersSectionNode}
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
