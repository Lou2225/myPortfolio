"use client";

import React, { useState } from "react";
import { Project } from "@/types/portfolio";
import { AdminMobileStepView } from "@/components/admin/AdminMobileStepView";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  FieldSlotButton,
  IconActionButton,
} from "@/components/ui/ActionButtons";
import {
  ActionMenuButton,
  buildReorderMenuItems,
} from "@/components/ui/ActionMenuButton";
import {
  ImageUploadField,
  MessageField,
  SubjectField,
  TextField,
  UrlField,
} from "@/components/ui/fields";
import { SortableTextRow } from "@/components/admin/SortableTextRow";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { validateProjectYear, validateSkillName } from "@/lib/validation";
import { cn, findDuplicateValues } from "@/lib/utils";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Plus,
  Star,
} from "lucide-react";

export type ProjectDetailStep = 0 | 1 | 2 | 3;

const PROJECT_STEPS: readonly {
  step: ProjectDetailStep;
  shortCode: string;
  shortTitle: string;
  heading: string;
  subtitle: string;
}[] = [
  {
    step: 0,
    shortCode: "01",
    shortTitle: "Info",
    heading: "01 · Identity & Impact Header",
    subtitle: "Title, Classification & Outcomes",
  },
  {
    step: 1,
    shortCode: "02",
    shortTitle: "Media",
    heading: "02 · Showcase Media & Destination Links",
    subtitle: "Screenshot Preview, Repo & Live Demo",
  },
  {
    step: 2,
    shortCode: "03",
    shortTitle: "Story",
    heading: "03 · Case Study Breakdown",
    subtitle: "Architecture Overview, Problem & Solution",
  },
  {
    step: 3,
    shortCode: "04",
    shortTitle: "Stack",
    heading: "04 · Tech Stack Badges",
    subtitle: "Technologies & Tools Featured on Card",
  },
];

/** Maps a validation error message onto its owning step (`01..04`). */
export function classifyProjectErrorStep(errorMessage: string): ProjectDetailStep {
  const lower = errorMessage.toLowerCase();
  if (lower.includes("tech badge") || lower.includes("tech stack")) return 3;
  if (
    lower.includes("summary") ||
    lower.includes("problem") ||
    lower.includes("solution")
  ) {
    return 2;
  }
  if (
    lower.includes("preview image") ||
    lower.includes("github") ||
    lower.includes("live demo")
  ) {
    return 1;
  }
  return 0;
}

export interface ProjectDetailEditorProps {
  project: Project;
  index: number;
  totalCount: number;
  activeStep: ProjectDetailStep;
  onChangeStep: (step: ProjectDetailStep) => void;
  forceTouched: boolean;
  errors: string[];
  isTitleDuplicate: boolean;
  isImageDirty: boolean;
  pendingImageFile: File | null;
  techIds: string[];
  newTechValue: string;
  techFeedback: string | null;
  onBack: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdateField: <K extends keyof Project>(field: K, value: Project[K]) => void;
  onPendingImageChange: (file: File | null) => void;
  onRevertImage: () => void;
  onUploadError: (message: string) => void;
  onNewTechChange: (value: string) => void;
  onAddTech: () => void;
  onUpdateTech: (techIdx: number, nextValue: string) => void;
  onMoveTech: (techIdx: number, direction: -1 | 1) => void;
  onRemoveTech: (techIdx: number) => void;
}

/**
 * Focused Single-Project Drill-Down Workspace (Option 1):
 * - Desktop (`>= lg`): All 4 Profile-style section cards + bottom Back bar.
 * - Mobile / Tablet (`< lg`): Guided 4-step view (`01 Info · 02 Media · 03 Story · 04 Stack`)
 *   with error indicators and bottom Previous/Next/Done navigation.
 * - Tech Stack Badges match Story & Marquee Ticker (`SortableTextRow` + `ActionMenuButton`).
 */
export function ProjectDetailEditor({
  project,
  index,
  totalCount,
  activeStep,
  onChangeStep,
  forceTouched,
  errors,
  isTitleDuplicate,
  isImageDirty,
  pendingImageFile,
  techIds,
  newTechValue,
  techFeedback,
  onBack,
  onMoveUp,
  onMoveDown,
  onDelete,
  onUpdateField,
  onPendingImageChange,
  onRevertImage,
  onUploadError,
  onNewTechChange,
  onAddTech,
  onUpdateTech,
  onMoveTech,
  onRemoveTech,
}: ProjectDetailEditorProps) {
  const isMobileOrTablet = useMediaQuery("(max-width: 1023px)");
  const [stepDirection, setStepDirection] = useState<"forward" | "back">(
    "forward"
  );
  const isPublished = project.published !== false;
  const duplicateStackSet = findDuplicateValues(project.stack);

  const switchStep = (nextStep: ProjectDetailStep) => {
    if (nextStep === activeStep) return;
    setStepDirection(nextStep > activeStep ? "forward" : "back");
    onChangeStep(nextStep);
  };

  const stepHasError: Record<ProjectDetailStep, boolean> = {
    0: false,
    1: false,
    2: false,
    3: false,
  };
  if (forceTouched && errors.length > 0) {
    for (const err of errors) {
      stepHasError[classifyProjectErrorStep(err)] = true;
    }
  }

  const mobileSteps = PROJECT_STEPS.map((item) => ({
    code: item.shortCode,
    shortTitle: item.shortTitle,
    ariaLabel: `${item.shortCode} ${item.shortTitle}`,
    hasError: stepHasError[item.step],
  }));

  const renderPanelHeader = (stepMeta: (typeof PROJECT_STEPS)[number]) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 sm:gap-2 border-b border-(--border-subtle) pb-3">
      <span className="font-display text-lg sm:text-xl uppercase tracking-tight text-(--text-primary) block">
        {stepMeta.step === 3
          ? `${stepMeta.heading} (${project.stack.length})`
          : stepMeta.heading}
      </span>
      <span className="text-[11px] font-mono text-(--text-muted)">
        {stepMeta.subtitle}
      </span>
    </div>
  );

  const panel01Body = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        <SubjectField
          id={`proj-${project.id}-title`}
          className="md:col-span-6"
          label="Project Title"
          value={project.title}
          onChange={(title) => onUpdateField("title", title)}
          minLength={3}
          maxLength={100}
          showCounter
          showIcon={false}
          forceTouched={forceTouched}
          hint={
            isTitleDuplicate
              ? "Duplicate project title — give each system a distinct name."
              : undefined
          }
        />

        <TextField
          id={`proj-${project.id}-category`}
          className="md:col-span-4"
          label="Category Badge"
          value={project.category}
          onChange={(category) => onUpdateField("category", category)}
          placeholder="e.g. Full-Stack System"
          minLength={2}
          maxLength={50}
          showCounter
          forceTouched={forceTouched}
        />

        <TextField
          id={`proj-${project.id}-year`}
          className="md:col-span-2"
          label="Year"
          value={project.year}
          onChange={(year) => onUpdateField("year", year)}
          validate={(val) =>
            validateProjectYear(val, `Project #${index + 1} Year`)
          }
          placeholder="2026"
          minLength={2}
          maxLength={20}
          mono
          forceTouched={forceTouched}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        <TextField
          id={`proj-${project.id}-role`}
          className="md:col-span-5"
          label="Your Role"
          value={project.role}
          onChange={(role) => onUpdateField("role", role)}
          placeholder="e.g. Lead Full-Stack Developer"
          minLength={3}
          maxLength={90}
          showCounter
          forceTouched={forceTouched}
        />

        <TextField
          id={`proj-${project.id}-outcome`}
          className="md:col-span-7"
          label="Headline Outcome"
          value={project.outcome}
          onChange={(outcome) => onUpdateField("outcome", outcome)}
          placeholder="e.g. Production Capstone System"
          minLength={3}
          maxLength={90}
          showCounter
          forceTouched={forceTouched}
        />
      </div>

      <TextField
        id={`proj-${project.id}-metrics`}
        label="Measured Impact / Metrics Banner"
        value={project.metrics}
        onChange={(metrics) => onUpdateField("metrics", metrics)}
        placeholder="e.g. Reduced record processing time by 65% with zero data loss."
        minLength={5}
        maxLength={140}
        showCounter
        mono
        forceTouched={forceTouched}
        hint="Displayed in the highlighted accent metrics callout on the public card."
      />
    </div>
  );

  const panel02Body = (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
      <div className="xl:col-span-7 min-w-0">
        <ImageUploadField
          id={`proj-${project.id}-image`}
          folder="projects"
          label="Project Preview Image"
          value={project.image || ""}
          pendingFile={pendingImageFile}
          onChange={(image) => onUpdateField("image", image)}
          onPendingFileChange={onPendingImageChange}
          onRevertToSaved={onRevertImage}
          onUploadError={onUploadError}
          isDraftModified={isImageDirty}
          previewShape="landscape"
          previewSize="lg"
          previewFit="cover"
          previewAlt={project.title || "Project showcase preview"}
          editable={false}
          required
          allowRelativePath
          forceTouched={forceTouched}
          hint="Recommended 16:10 screenshot (.webp, .png, .jpg max 5MB). Staged until Save & Publish."
        />
      </div>

      <div className="xl:col-span-5 min-w-0 space-y-4">
        <UrlField
          id={`proj-${project.id}-github`}
          label="GitHub Repository URL"
          placeholder="https://github.com/..."
          value={project.githubUrl || ""}
          onChange={(githubUrl) => onUpdateField("githubUrl", githubUrl)}
          required={false}
          allowRelativePath={false}
          forceTouched={forceTouched}
        />

        <UrlField
          id={`proj-${project.id}-live`}
          label="Live Demo URL (Optional)"
          placeholder="https://..."
          value={project.liveUrl || ""}
          onChange={(liveUrl) => onUpdateField("liveUrl", liveUrl)}
          required={false}
          allowRelativePath={false}
          forceTouched={forceTouched}
        />
      </div>
    </div>
  );

  const panel03Body = (
    <div className="space-y-4">
      <MessageField
        id={`proj-${project.id}-description`}
        label="System Summary Description"
        rows={3}
        minLength={15}
        maxLength={500}
        showCounter
        expandableOnMobile
        value={project.description}
        onChange={(description) => onUpdateField("description", description)}
        forceTouched={forceTouched}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <MessageField
          id={`proj-${project.id}-problem`}
          label="The Problem (Case Study Left Box)"
          rows={3}
          minLength={15}
          maxLength={400}
          showCounter
          expandableOnMobile
          value={project.problem}
          onChange={(problem) => onUpdateField("problem", problem)}
          forceTouched={forceTouched}
        />

        <MessageField
          id={`proj-${project.id}-solution`}
          label="Engineered Solution (Case Study Right Box)"
          rows={3}
          minLength={15}
          maxLength={400}
          showCounter
          expandableOnMobile
          value={project.solution}
          onChange={(solution) => onUpdateField("solution", solution)}
          forceTouched={forceTouched}
        />
      </div>
    </div>
  );

  const panel04Body = (
    <div
      data-field-invalid={
        forceTouched && project.stack.length === 0 ? "true" : undefined
      }
      className="space-y-4"
    >
      {project.stack.length > 0 ? (
        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4 items-start">
          {project.stack.map((tech, techIdx) => {
            const techKey =
              techIds[techIdx] ?? `proj-${project.id}-tech-fallback-${techIdx}`;
            const norm = tech.trim().toLowerCase();
            const isDup = norm !== "" && duplicateStackSet.has(norm);

            return (
              <SortableTextRow
                key={techKey}
                id={`proj-${project.id}-tech-${techKey}`}
                label={`Tech Badge ${String(techIdx + 1).padStart(2, "0")}`}
                itemNoun="tech badge"
                removeLabel="Remove Badge"
                index={techIdx}
                totalCount={project.stack.length}
                value={tech}
                placeholder="e.g. PostgreSQL"
                minLength={1}
                maxLength={36}
                forceTouched={forceTouched}
                hint={
                  isDup
                    ? "Duplicate tech badge — keep each stack item unique."
                    : undefined
                }
                validate={(val) =>
                  validateSkillName(
                    val,
                    `Tech Badge ${String(techIdx + 1).padStart(2, "0")}`
                  )
                }
                onChange={(nextVal) => onUpdateTech(techIdx, nextVal)}
                onMove={(dir) => onMoveTech(techIdx, dir === "up" ? -1 : 1)}
                onRemove={() => onRemoveTech(techIdx)}
              />
            );
          })}
        </div>
      ) : (
        <p role="alert" className="text-xs font-mono text-(--text-accent)">
          At least one tech stack badge is required.
        </p>
      )}

      <div
        className="max-w-lg pt-3 border-t border-(--border-subtle)/60"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAddTech();
          }
        }}
      >
        <TextField
          id={`proj-${project.id}-add-tech`}
          label="Add Technology Badge"
          value={newTechValue}
          onChange={onNewTechChange}
          placeholder="e.g. Prisma ORM, Power BI, Redis"
          required={false}
          minLength={1}
          maxLength={36}
          showCounter
          wrapRightSlotOnMobile
          validate={(val) =>
            val.trim() ? validateSkillName(val, "Tech Badge") : { valid: true }
          }
          hint={
            techFeedback ??
            "Press Enter or click Add Badge to append to this project."
          }
          rightSlot={
            <FieldSlotButton
              onClick={onAddTech}
              className="w-full sm:w-auto justify-center"
            >
              <Plus
                className="w-3.5 h-3.5 text-(--text-accent)"
                aria-hidden="true"
              />
              <span>Add Badge</span>
            </FieldSlotButton>
          }
        />
      </div>
    </div>
  );

  const panels = [
    { meta: PROJECT_STEPS[0], body: panel01Body },
    { meta: PROJECT_STEPS[1], body: panel02Body },
    { meta: PROJECT_STEPS[2], body: panel03Body },
    { meta: PROJECT_STEPS[3], body: panel04Body },
  ];

  const activeMobilePanel = panels[activeStep] ?? panels[0];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Sub-Navigation & Project Controls Bar (Zero Title Squish on Mobile + Unified Desktop Row) */}
      <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:px-5 sm:py-4 flex flex-wrap lg:flex-nowrap items-center justify-between gap-x-3 gap-y-2.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onBack}
          aria-label="Back to all projects"
          className="order-1 font-mono text-xs h-9 pl-2.5 pr-3.5 gap-1 leading-none shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Projects</span>
        </Button>

        <div className="order-3 lg:order-2 basis-full lg:basis-auto lg:flex-1 min-w-0 pt-2.5 lg:pt-0 border-t lg:border-t-0 border-(--border-subtle)/60 flex items-start sm:items-center justify-between gap-2">
          <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
            <StatusPill
              label={`#${String(index + 1).padStart(2, "0")}`}
              variant="accent"
              size="xs"
              className="mt-0.5 sm:mt-0 shrink-0"
            />
            <span className="text-sm sm:text-base font-semibold text-(--text-primary) leading-snug wrap-break-word lg:truncate">
              {project.title || "Untitled Project"}
            </span>
          </div>

          {forceTouched && errors.length > 0 && (
            <StatusPill
              label={`${errors.length} ${errors.length === 1 ? "Issue" : "Issues"}`}
              variant="danger"
              size="xs"
              className="shrink-0"
              icon={<AlertCircle className="w-3 h-3" aria-hidden="true" />}
            />
          )}
        </div>

        <div className="order-2 lg:order-3 flex items-center gap-1.5 shrink-0 ml-auto lg:ml-0">
          <Button
            type="button"
            variant={isPublished ? "secondary" : "outline"}
            size="sm"
            onClick={() => onUpdateField("published", !isPublished)}
            className={cn(
              "h-9 px-3 font-mono text-[11px]",
              isPublished
                ? "border-emerald-500/35 bg-emerald-500/10 text-(--text-success) hover:text-(--text-success) hover:border-emerald-500/60"
                : "text-(--text-muted)"
            )}
            aria-label={
              isPublished
                ? `Set ${project.title} to Draft`
                : `Publish ${project.title} Live`
            }
          >
            {isPublished ? (
              <>
                <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Live</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Draft</span>
              </>
            )}
          </Button>

          <IconActionButton
            label={
              project.featured
                ? `Unmark ${project.title || "project"} as featured`
                : `Mark ${project.title || "project"} as featured`
            }
            size="compact"
            onClick={() => onUpdateField("featured", !project.featured)}
            className={
              project.featured
                ? "border-brand/55 bg-(--bg-badge-highlight) text-(--text-accent)"
                : undefined
            }
            icon={
              <Star
                className={cn("w-3.5 h-3.5", project.featured && "fill-current")}
                aria-hidden="true"
              />
            }
          />

          <ActionMenuButton
            label={`Actions for project ${index + 1}`}
            size="compact"
            items={buildReorderMenuItems({
              index,
              total: totalCount,
              onMoveUp,
              onMoveDown,
              removeLabel: "Delete Project",
              canRemove: totalCount > 1,
              onRemove: onDelete,
            })}
          />
        </div>
      </div>

      {isMobileOrTablet ? (
        <AdminMobileStepView
          ariaLabel="Project editing steps"
          steps={mobileSteps}
          activeStep={activeStep}
          direction={stepDirection}
          onChangeStep={(next) => switchStep(next as ProjectDetailStep)}
          finalAction={{
            label: "Done",
            variant: "primary",
            onClick: onBack,
            icon: <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
          }}
        >
          <section className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 min-w-0">
            {renderPanelHeader(activeMobilePanel.meta)}
            {activeMobilePanel.body}
          </section>
        </AdminMobileStepView>
      ) : (
        /* Desktop: Clean Stacked Profile-Style Section Cards + Seamless Bottom Back Bar */
        <>
          <div className="space-y-6">
            {panels.map(({ meta, body }) => (
              <section
                key={meta.step}
                className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-6 space-y-5 min-w-0"
              >
                {renderPanelHeader(meta)}
                {body}
              </section>
            ))}
          </div>

          <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-4 sm:px-6 flex items-center justify-between gap-4">
            <span className="text-xs font-mono text-(--text-muted)">
              Editing Project #{String(index + 1).padStart(2, "0")} of {totalCount}
            </span>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onBack}
              className="h-10 px-5 font-mono text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Back to All Projects</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
