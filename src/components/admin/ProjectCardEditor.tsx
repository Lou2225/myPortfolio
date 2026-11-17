"use client";

import { useRef } from "react";
import { Project } from "@/types/portfolio";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  FieldSlotButton,
  IconActionButton,
  ReorderActionGroup,
} from "@/components/ui/ActionButtons";
import {
  ImageUploadField,
  MessageField,
  SubjectField,
  TextField,
  UrlField,
} from "@/components/ui/fields";
import { TransformedImage } from "@/components/ui/TransformedImage";
import { useInstantImageUrl } from "@/lib/instantImageCache";
import { Collapsible } from "@/components/motion/Collapsible";
import { validateProjectYear, validateSkillName } from "@/lib/validation";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  ImageIcon,
  Plus,
  Star,
  X,
} from "lucide-react";

interface ProjectCardEditorProps {
  project: Project;
  index: number;
  totalCount: number;
  expanded: boolean;
  forceTouched: boolean;
  errors: string[];
  isTitleDuplicate: boolean;
  isImageDirty: boolean;
  pendingImageFile: File | null;
  newTechValue: string;
  techFeedback: string | null;
  onToggleExpand: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdateField: <K extends keyof Project>(
    field: K,
    value: Project[K]
  ) => void;
  onPendingImageChange: (file: File | null) => void;
  onRevertImage: () => void;
  onUploadError: (message: string) => void;
  onNewTechChange: (value: string) => void;
  onAddTech: () => void;
  onMoveTech: (techIdx: number, direction: -1 | 1) => void;
  onRemoveTech: (techIdx: number) => void;
  followOnExpand?: boolean;
}

export function ProjectCardEditor({
  project,
  index,
  totalCount,
  expanded,
  forceTouched,
  errors,
  isTitleDuplicate,
  isImageDirty,
  pendingImageFile,
  newTechValue,
  techFeedback,
  onToggleExpand,
  onMoveUp,
  onMoveDown,
  onDelete,
  onUpdateField,
  onPendingImageChange,
  onRevertImage,
  onUploadError,
  onNewTechChange,
  onAddTech,
  onMoveTech,
  onRemoveTech,
  followOnExpand = true,
}: ProjectCardEditorProps) {
  const cardRef = useRef<HTMLElement>(null);
  const isPublished = project.published !== false;
  const thumbSrc = useInstantImageUrl(project.image);
  const showCardErrorState = forceTouched && errors.length > 0;

  return (
    <article
      ref={cardRef}
      className={cn(
        "bg-(--bg-surface) border rounded-(--radius-card) overflow-hidden transition-all shadow-sm",
        showCardErrorState
          ? "border-brand/60"
          : isPublished
            ? "border-(--border-subtle)"
            : "border-(--border-subtle) opacity-85"
      )}
    >
      {/* Structured Header Strip */}
      <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="flex items-center gap-3.5 text-left min-w-0 flex-1 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-(--radius-control)"
        >
          {/* Compact 16:10 Mini Thumbnail */}
          <div
            className={cn(
              "w-16 h-10 rounded-sm overflow-hidden border bg-(--bg-surface-2) shrink-0 flex items-center justify-center relative",
              pendingImageFile || isImageDirty
                ? "border-amber-400/70"
                : "border-(--border-strong)"
            )}
          >
            {thumbSrc ? (
              <TransformedImage
                src={thumbSrc}
                alt={project.title || "Project preview"}
                defaultFit="cover"
                className="w-full h-full"
              />
            ) : (
              <ImageIcon
                className="w-4 h-4 text-(--text-muted)"
                aria-hidden="true"
              />
            )}
            {pendingImageFile && (
              <span
                title="Screenshot staged in draft"
                className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 shadow"
              />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                label={`#${String(index + 1).padStart(2, "0")}`}
                variant="accent"
                size="xs"
              />
              <h3 className="font-display text-xl sm:text-2xl uppercase tracking-tight text-(--text-primary) group-hover:text-(--text-accent) transition-colors truncate">
                {project.title || "Untitled Project"}
              </h3>
              {project.featured && (
                <StatusPill label="Featured" variant="accent" size="xs" />
              )}
              {showCardErrorState && (
                <StatusPill
                  label={`${errors.length} ${errors.length === 1 ? "Issue" : "Issues"}`}
                  variant="danger"
                  size="xs"
                  icon={<AlertCircle className="w-3 h-3" aria-hidden="true" />}
                />
              )}
            </div>

            <p className="text-[11px] font-mono text-(--text-muted) truncate">
              {project.category || "Uncategorized"} · {project.year || "Year"} ·{" "}
              {project.stack.length}{" "}
              {project.stack.length === 1 ? "tech badge" : "tech badges"}
              {!expanded ? " · Click to edit details" : ""}
            </p>
          </div>
        </button>

        {/* Standardized Card Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
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
                className={cn(
                  "w-3.5 h-3.5",
                  project.featured && "fill-current"
                )}
                aria-hidden="true"
              />
            }
          />

          <ReorderActionGroup
            index={index}
            total={totalCount}
            itemLabel={`project ${index + 1}`}
            canRemove={totalCount > 1}
            size="compact"
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onDelete}
          />

          <IconActionButton
            label={
              expanded ? "Collapse project details" : "Expand project details"
            }
            size="compact"
            aria-expanded={expanded}
            onClick={onToggleExpand}
            icon={
              <ChevronDown
                className={cn(
                  "w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  expanded ? "rotate-180" : "rotate-0"
                )}
                aria-hidden="true"
              />
            }
          />
        </div>
      </div>

      {/* Smooth 4-Panel Case Study Accordion Editor */}
      <Collapsible
        open={expanded}
        containerRef={cardRef}
        followOnOpen={followOnExpand}
        staggerChildren
        contentClassName="border-t border-(--border-subtle) p-5 sm:p-6 space-y-5 bg-(--bg-canvas)/25"
      >
          {/* Panel 01: Identity & Impact Header */}
          <section
            data-collapsible-panel
            className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-sm p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-(--border-subtle) pb-2.5">
              <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-accent)">
                01 · Identity & Impact Header
              </span>
              <span className="text-[10px] font-mono text-(--text-muted)">
                Title, Classification & Outcomes
              </span>
            </div>

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
          </section>

          {/* Panel 02: Showcase Media & External Links */}
          <section
            data-collapsible-panel
            className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-sm p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-(--border-subtle) pb-2.5">
              <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-accent)">
                02 · Showcase Media & Destination Links
              </span>
              <span className="text-[10px] font-mono text-(--text-muted)">
                Screenshot Preview, Repo & Live Demo
              </span>
            </div>

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
          </section>

          {/* Panel 03: Case Study Breakdown */}
          <section
            data-collapsible-panel
            className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-sm p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-(--border-subtle) pb-2.5">
              <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-accent)">
                03 · Case Study Breakdown
              </span>
              <span className="text-[10px] font-mono text-(--text-muted)">
                Architecture Overview, Problem & Solution
              </span>
            </div>

            <MessageField
              id={`proj-${project.id}-description`}
              label="System Summary Description"
              rows={3}
              minLength={15}
              maxLength={500}
              showCounter
              value={project.description}
              onChange={(description) =>
                onUpdateField("description", description)
              }
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
                value={project.solution}
                onChange={(solution) => onUpdateField("solution", solution)}
                forceTouched={forceTouched}
              />
            </div>
          </section>

          {/* Panel 04: Tech Stack Badges */}
          <section
            data-collapsible-panel
            data-field-invalid={
              forceTouched && project.stack.length === 0 ? "true" : undefined
            }
            className="bg-(--bg-surface-2) border border-(--border-subtle) rounded-sm p-4 sm:p-5 space-y-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--border-subtle) pb-2.5">
              <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-accent)">
                04 · Tech Stack Badges ({project.stack.length})
              </span>
              <span className="text-[10px] font-mono text-(--text-muted)">
                Use arrows to order badges on the card footer
              </span>
            </div>

            {project.stack.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {project.stack.map((tech, techIdx) => (
                  <span
                    key={`${tech}-${techIdx}`}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1.5 rounded-sm bg-(--bg-surface) border border-(--border-strong) text-xs font-mono text-(--text-primary)"
                  >
                    <span className="pr-1">{tech}</span>

                    {project.stack.length > 1 && (
                      <>
                        <IconActionButton
                          size="xs"
                          label={`Move ${tech} earlier`}
                          title="Move earlier"
                          disabled={techIdx === 0}
                          onClick={() => onMoveTech(techIdx, -1)}
                          className="border-transparent bg-transparent hover:border-transparent"
                          icon={
                            <ChevronLeft
                              className="w-3.5 h-3.5"
                              aria-hidden="true"
                            />
                          }
                        />
                        <IconActionButton
                          size="xs"
                          label={`Move ${tech} later`}
                          title="Move later"
                          disabled={techIdx === project.stack.length - 1}
                          onClick={() => onMoveTech(techIdx, 1)}
                          className="border-transparent bg-transparent hover:border-transparent"
                          icon={
                            <ChevronRight
                              className="w-3.5 h-3.5"
                              aria-hidden="true"
                            />
                          }
                        />
                      </>
                    )}

                    <IconActionButton
                      size="xs"
                      intent="danger"
                      label={
                        project.stack.length <= 1
                          ? "At least one tech stack badge is required"
                          : `Remove ${tech}`
                      }
                      title={
                        project.stack.length <= 1
                          ? "At least one badge required"
                          : `Remove ${tech}`
                      }
                      disabled={project.stack.length <= 1}
                      onClick={() => onRemoveTech(techIdx)}
                      className="border-transparent bg-transparent hover:border-transparent"
                      icon={<X className="w-3.5 h-3.5" aria-hidden="true" />}
                    />
                  </span>
                ))}
              </div>
            ) : (
              <p role="alert" className="text-xs font-mono text-(--text-accent)">
                At least one tech stack badge is required.
              </p>
            )}

            <div
              className="max-w-md pt-1"
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
                validate={(val) =>
                  val.trim()
                    ? validateSkillName(val, "Tech Badge")
                    : { valid: true }
                }
                hint={
                  techFeedback ??
                  "Press Enter or click Add Badge to append to this project."
                }
                rightSlot={
                  <FieldSlotButton onClick={onAddTech}>
                    <Plus
                      className="w-3.5 h-3.5 text-(--text-accent)"
                      aria-hidden="true"
                    />
                    <span>Add Badge</span>
                  </FieldSlotButton>
                }
              />
            </div>
          </section>
      </Collapsible>
    </article>
  );
}

