"use client";

import { Project } from "@/types/portfolio";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { IconActionButton } from "@/components/ui/ActionButtons";
import {
  ActionMenuButton,
  buildReorderMenuItems,
} from "@/components/ui/ActionMenuButton";
import { TransformedImage } from "@/components/ui/TransformedImage";
import { useInstantImageUrl } from "@/lib/instantImageCache";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ChevronRight,
  Eye,
  EyeOff,
  ImageIcon,
  Star,
} from "lucide-react";

export interface ProjectCardEditorProps {
  project: Project;
  index: number;
  totalCount: number;
  forceTouched: boolean;
  errors: string[];
  isImageDirty: boolean;
  pendingImageFile: File | null;
  onOpenProject: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdateField: <K extends keyof Project>(
    field: K,
    value: Project[K]
  ) => void;
}

/**
 * Clean Project Summary Card inside the Projects List Hub.
 * Clicking the card body or `Edit` drills smoothly into `<ProjectDetailEditor />`
 * so editing stays uncluttered on both mobile and desktop viewports.
 */
export function ProjectCardEditor({
  project,
  index,
  totalCount,
  forceTouched,
  errors,
  isImageDirty,
  pendingImageFile,
  onOpenProject,
  onMoveUp,
  onMoveDown,
  onDelete,
  onUpdateField,
}: ProjectCardEditorProps) {
  const isPublished = project.published !== false;
  const thumbSrc = useInstantImageUrl(project.image);
  const showCardErrorState = forceTouched && errors.length > 0;

  return (
    <article
      className={cn(
        "bg-(--bg-surface) border rounded-(--radius-card) overflow-hidden transition-all shadow-sm hover:border-(--border-strong)",
        showCardErrorState
          ? "border-brand/60"
          : isPublished
            ? "border-(--border-subtle)"
            : "border-(--border-subtle) opacity-85"
      )}
    >
      <div className="p-3.5 sm:px-5 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-4">
        <button
          type="button"
          onClick={onOpenProject}
          className="flex items-center gap-3 sm:gap-3.5 text-left min-w-0 flex-1 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-(--radius-control)"
        >
          {/* Compact 16:10 Preview Thumbnail */}
          <div
            className={cn(
              "w-20 aspect-16/10 sm:w-22 rounded-(--radius-control) overflow-hidden border bg-(--bg-surface-2) shrink-0 flex items-center justify-center relative",
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
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <StatusPill
                label={`#${String(index + 1).padStart(2, "0")}`}
                variant="accent"
                size="xs"
              />
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

            <h3 className="font-display text-lg sm:text-xl lg:text-2xl uppercase tracking-tight leading-[1.12] text-(--text-primary) group-hover:text-(--text-accent) transition-colors line-clamp-2 sm:truncate">
              {project.title || "Untitled Project"}
            </h3>

            <p className="text-[11px] font-mono text-(--text-muted) leading-snug whitespace-normal sm:truncate">
              {project.category || "Uncategorized"} · {project.year || "Year"} ·{" "}
              {project.stack.length}{" "}
              {project.stack.length === 1 ? "badge" : "badges"}
            </p>
          </div>
        </button>

        {/* Card Action Bar */}
        <div className="flex items-center justify-between lg:justify-end gap-2 pt-2.5 border-t border-(--border-subtle)/60 lg:border-t-0 lg:pt-0 shrink-0 w-full lg:w-auto">
          <div className="flex items-center gap-1.5">
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
          </div>

          <div className="flex items-center gap-1.5">
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

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onOpenProject}
              aria-label={`Edit ${project.title || `project ${index + 1}`}`}
              className="h-9 pl-3.5 pr-2.5 gap-1 font-mono text-[11px] leading-none border-(--border-strong)"
            >
              <span>Edit</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
