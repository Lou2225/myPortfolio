"use client";

import React, { useMemo, useRef, useState } from "react";
import { Project } from "@/types/portfolio";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Tabs, TabItem } from "@/components/ui/Tabs";
import { TabPanel } from "@/components/ui/TabPanel";
import { AdminAlertBanner } from "@/components/admin/AdminAlertBanner";
import { ProjectCardEditor } from "@/components/admin/ProjectCardEditor";
import {
  isNetworkOffline,
  useOfflineStatus,
} from "@/components/pwa/OfflineManager";
import {
  announceBrandPortalStatus,
  useBrandPortalWorkspaceSync,
} from "@/lib/brandPortalStatus";
import { uploadImageToAdminApi } from "@/lib/instantImageCache";
import { findDuplicateValues, swapArrayItem } from "@/lib/utils";
import {
  sanitizeTextInput,
  validateProjectsDraft,
  validateSkillName,
} from "@/lib/validation";
import { useValidationFollower } from "@/lib/validationFollow";
import {
  AlertTriangle,
  Briefcase,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderOpen,
  Loader2,
  Plus,
  RotateCcw,
  Save,
} from "lucide-react";

interface ProjectsManagerProps {
  projects: Project[];
  onSave: (updatedProjects: Project[]) => Promise<void>;
}

type ProjectFilterMode = "all" | "live" | "draft" | "featured";

interface ConfirmState {
  title: string;
  description: string;
  confirmLabel: string;
  variant: "primary" | "danger";
  action: () => Promise<void> | void;
}

function cloneProjects(items: Project[]): Project[] {
  return items.map((item) => ({
    ...item,
    stack: [...item.stack],
  }));
}

function buildProjectsSignature(items: Project[]): string {
  return JSON.stringify(
    items.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      year: item.year,
      role: item.role,
      outcome: item.outcome,
      description: item.description,
      problem: item.problem,
      solution: item.solution,
      stack: item.stack,
      image: item.image,
      metrics: item.metrics,
      githubUrl: (item.githubUrl || "").trim(),
      liveUrl: (item.liveUrl || "").trim(),
      featured: Boolean(item.featured),
      published: item.published !== false,
    }))
  );
}

function createUniqueProjectTitle(existing: Project[]): string {
  const baseTitle = "New Full-Stack System";
  const taken = new Set(existing.map((item) => item.title.trim().toLowerCase()));
  if (!taken.has(baseTitle.toLowerCase())) {
    return baseTitle;
  }

  let suffix = 2;
  while (taken.has(`${baseTitle} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${baseTitle} ${suffix}`;
}

export function ProjectsManager({ projects, onSave }: ProjectsManagerProps) {
  const [savedBaseline, setSavedBaseline] = useState<Project[]>(() =>
    cloneProjects(projects)
  );
  const [draft, setDraft] = useState<Project[]>(() => cloneProjects(projects));
  const [savedSignature, setSavedSignature] = useState<string>(() =>
    buildProjectsSignature(projects)
  );
  const [pendingFiles, setPendingFiles] = useState<Record<string, File | null>>(
    {}
  );
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(() =>
    projects[0] ? { [projects[0].id]: true } : {}
  );
  const [filterMode, setFilterMode] = useState<ProjectFilterMode>("all");
  const [newTechInputs, setNewTechInputs] = useState<Record<string, string>>(
    {}
  );
  const [techFeedbacks, setTechFeedbacks] = useState<
    Record<string, string | null>
  >({});

  const [saving, setSaving] = useState(false);
  const [suppressExpandFollow, setSuppressExpandFollow] = useState(false);
  const [forceTouched, setForceTouched] = useState(false);
  const [validationBannerActive, setValidationBannerActive] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const { followFirstInvalid, followNextInvalid } = useValidationFollower();
  const { isOnline } = useOfflineStatus();
  const offline = isNetworkOffline(isOnline);

  const hasPendingImages = useMemo(
    () => Object.values(pendingFiles).some(Boolean),
    [pendingFiles]
  );

  const currentSignature = useMemo(() => buildProjectsSignature(draft), [draft]);
  const hasUnsavedChanges =
    currentSignature !== savedSignature || hasPendingImages;

  useBrandPortalWorkspaceSync({
    moduleId: "projects",
    moduleLabel: "Projects",
    hasUnsavedChanges,
    saving,
  });

  const pendingImageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, file] of Object.entries(pendingFiles)) {
      if (file) ids.add(id);
    }
    return ids;
  }, [pendingFiles]);

  const savedImageById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of savedBaseline) {
      map[item.id] = item.image;
    }
    return map;
  }, [savedBaseline]);

  const liveValidation = useMemo(
    () => validateProjectsDraft(draft, pendingImageIds),
    [draft, pendingImageIds]
  );

  const liveErrorsCount = liveValidation.errors.length;
  const activeErrorBanner =
    apiError ??
    (validationBannerActive && liveErrorsCount > 0
      ? liveValidation.errors[0]
      : null);

  const duplicateTitleSet = useMemo(
    () => findDuplicateValues(draft.map((item) => item.title)),
    [draft]
  );

  const counts = useMemo(() => {
    let live = 0;
    let featured = 0;
    for (const item of draft) {
      if (item.published !== false) live += 1;
      if (item.featured) featured += 1;
    }
    return {
      total: draft.length,
      live,
      draftOnly: draft.length - live,
      featured,
    };
  }, [draft]);

  const visibleEntries = useMemo(() => {
    const mapped = draft.map((project, index) => ({ project, index }));
    if (filterMode === "live") {
      return mapped.filter(({ project }) => project.published !== false);
    }
    if (filterMode === "draft") {
      return mapped.filter(({ project }) => project.published === false);
    }
    if (filterMode === "featured") {
      return mapped.filter(({ project }) => Boolean(project.featured));
    }
    return mapped;
  }, [draft, filterMode]);

  const allVisibleExpanded =
    visibleEntries.length > 0 &&
    visibleEntries.every(({ project }) => Boolean(expandedIds[project.id]));

  const revealInvalidAndFollow = (mode: "first" | "next") => {
    setSuppressExpandFollow(true);
    setFilterMode("all");
    setExpandedIds((prev) => {
      const next = { ...prev };
      for (const [id, errs] of Object.entries(liveValidation.errorsByProject)) {
        if (errs.length > 0) {
          next[id] = true;
        }
      }
      return next;
    });
    setForceTouched(true);
    setValidationBannerActive(true);

    window.setTimeout(() => {
      if (mode === "first") {
        followFirstInvalid(formRef.current);
      } else {
        followNextInvalid(formRef.current);
      }
    }, 330);
  };

  const handleToggleExpand = (projectId: string) => {
    setSuppressExpandFollow(false);
    setExpandedIds((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const handleToggleExpandAllVisible = () => {
    setSuppressExpandFollow(true);
    const targetState = !allVisibleExpanded;
    setExpandedIds((prev) => {
      const next = { ...prev };
      for (const { project } of visibleEntries) {
        next[project.id] = targetState;
      }
      return next;
    });
  };

  const handleMoveProject = (index: number, direction: -1 | 1) => {
    setDraft((prev) => swapArrayItem(prev, index, direction));
  };

  const handleUpdateField = <K extends keyof Project>(
    projectId: string,
    field: K,
    value: Project[K]
  ) => {
    setDraft((prev) =>
      prev.map((item) =>
        item.id === projectId ? { ...item, [field]: value } : item
      )
    );
  };

  const handlePendingImageChange = (projectId: string, file: File | null) => {
    setPendingFiles((prev) => ({
      ...prev,
      [projectId]: file,
    }));
  };

  const handleRevertImage = (projectId: string) => {
    setPendingFiles((prev) => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
    const baselineImage =
      savedImageById[projectId] ?? "/images/projects/capstone.webp";
    handleUpdateField(projectId, "image", baselineImage);
  };

  const handleAddTech = (projectId: string) => {
    const project = draft.find((item) => item.id === projectId);
    if (!project) return;

    const raw = sanitizeTextInput(newTechInputs[projectId] || "", {
      maxLength: 40,
    }).trim();

    const check = validateSkillName(raw, "Tech Badge");
    if (!check.valid) {
      setTechFeedbacks((prev) => ({
        ...prev,
        [projectId]: check.error || "Enter a tech badge name first.",
      }));
      return;
    }

    const exists = project.stack.some(
      (tech) => tech.trim().toLowerCase() === raw.toLowerCase()
    );
    if (exists) {
      setTechFeedbacks((prev) => ({
        ...prev,
        [projectId]: `"${raw}" is already listed in this stack.`,
      }));
      return;
    }

    setDraft((prev) =>
      prev.map((item) =>
        item.id === projectId ? { ...item, stack: [...item.stack, raw] } : item
      )
    );
    setNewTechInputs((prev) => ({ ...prev, [projectId]: "" }));
    setTechFeedbacks((prev) => ({ ...prev, [projectId]: null }));
  };

  const handleMoveTech = (
    projectId: string,
    techIdx: number,
    direction: -1 | 1
  ) => {
    setDraft((prev) =>
      prev.map((item) =>
        item.id === projectId
          ? { ...item, stack: swapArrayItem(item.stack, techIdx, direction) }
          : item
      )
    );
  };

  const handleRemoveTech = (projectId: string, techIdx: number) => {
    setDraft((prev) =>
      prev.map((item) =>
        item.id === projectId
          ? { ...item, stack: item.stack.filter((_, idx) => idx !== techIdx) }
          : item
      )
    );
  };

  const handleAddProject = () => {
    const newId = `project-${Date.now()}`;
    const currentYear = String(new Date().getFullYear());
    const newProject: Project = {
      id: newId,
      title: createUniqueProjectTitle(draft),
      category: "Full-Stack Architecture",
      year: currentYear,
      role: "Solo Lead Developer",
      outcome: "100% End-to-End Ownership",
      metrics: "Sub-100ms Response · Production Ready",
      description:
        "Executive summary of this engineered software system and measurable impact.",
      problem:
        "Key technical or business bottleneck solved through scalable system architecture.",
      solution:
        "How database modeling, API layers, and frontend precision solved it cleanly.",
      stack: ["PostgreSQL", "Next.js", "TypeScript", "Tailwind CSS"],
      image: "/images/projects/capstone.webp",
      githubUrl: "",
      liveUrl: "",
      featured: true,
      published: true,
    };

    setSuppressExpandFollow(false);
    setFilterMode("all");
    setDraft((prev) => [...prev, newProject]);

    window.requestAnimationFrame(() => {
      setExpandedIds((prev) => ({ ...prev, [newId]: true }));
    });
  };

  const handleDeleteProject = (projectId: string, title: string) => {
    if (draft.length <= 1) return;

    setConfirmState({
      title: "Delete Project?",
      description: `Remove "${title || "Untitled Project"}" from your working draft? This change stays staged until you Save & Publish.`,
      confirmLabel: "Delete Project",
      variant: "danger",
      action: () => {
        setDraft((prev) => prev.filter((item) => item.id !== projectId));
        setPendingFiles((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
        setExpandedIds((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
        setNewTechInputs((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
        setTechFeedbacks((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
      },
    });
  };

  const handleDiscardDraft = () => {
    setConfirmState({
      title: "Discard Unsaved Project Changes?",
      description:
        "Revert all unsaved project edits, staged screenshots, ordering, and badges back to your last published snapshot?",
      confirmLabel: "Discard Changes",
      variant: "danger",
      action: () => {
        setDraft(cloneProjects(savedBaseline));
        setPendingFiles({});
        setNewTechInputs({});
        setTechFeedbacks({});
        setForceTouched(false);
        setValidationBannerActive(false);
        setApiError(null);
        announceBrandPortalStatus({
          tone: "synced",
          label: "Changes Discarded",
          detail: "Projects reverted to last published state",
        });
      },
    });
  };

  const executeSave = async () => {
    if (isNetworkOffline(isOnline)) {
      const msg =
        "You appear to be offline. Reconnect to publish project updates.";
      setApiError(msg);
      setConfirmState(null);
      announceBrandPortalStatus({
        tone: "offline",
        label: "Offline",
        detail: "Reconnect to publish Projects",
      });
      return;
    }

    setSaving(true);
    setApiError(null);
    announceBrandPortalStatus({
      tone: "saving",
      label: "Publishing...",
      detail: hasPendingImages
        ? "Uploading staged screenshots & publishing projects"
        : "Saving Projects & Case Studies to portfolio",
    });

    try {
      const cleanedProjects: Project[] = [];

      for (const project of draft) {
        let resolvedImage = project.image.trim();
        const stagedFile = pendingFiles[project.id];
        if (stagedFile) {
          resolvedImage = await uploadImageToAdminApi(stagedFile, "projects");
        }

        const trimmedGithub = (project.githubUrl || "").trim();
        const trimmedLive = (project.liveUrl || "").trim();

        cleanedProjects.push({
          ...project,
          title: project.title.trim(),
          category: project.category.trim(),
          year: project.year.trim(),
          role: project.role.trim(),
          outcome: project.outcome.trim(),
          metrics: project.metrics.trim(),
          description: project.description.trim(),
          problem: project.problem.trim(),
          solution: project.solution.trim(),
          stack: project.stack.map((tech) => tech.trim()).filter(Boolean),
          image: resolvedImage,
          githubUrl: trimmedGithub || undefined,
          liveUrl: trimmedLive || undefined,
          featured: Boolean(project.featured),
          published: project.published !== false,
        });
      }

      await onSave(cleanedProjects);

      const cleanBaseline = cloneProjects(cleanedProjects);
      setDraft(cleanBaseline);
      setSavedBaseline(cloneProjects(cleanBaseline));
      setSavedSignature(buildProjectsSignature(cleanBaseline));
      setPendingFiles({});
      setTechFeedbacks({});
      setForceTouched(false);
      setValidationBannerActive(false);
      setApiError(null);
      setConfirmState(null);

      announceBrandPortalStatus({
        tone: "live",
        label: "Saved & Live!",
        detail: `${cleanedProjects.length} portfolio ${
          cleanedProjects.length === 1 ? "project" : "projects"
        } published`,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save projects.";
      setApiError(msg);
      setConfirmState(null);
      announceBrandPortalStatus({
        tone: "error",
        label: "Publish Failed",
        detail: msg,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveValidation.valid) {
      setApiError(null);
      announceBrandPortalStatus({
        tone: "error",
        label: "Check Fields",
        detail:
          liveValidation.errors[0] || "Review required project card fields",
      });
      revealInvalidAndFollow("first");
      return;
    }

    setValidationBannerActive(false);
    setApiError(null);
    setConfirmState({
      title: "Save & Publish Projects?",
      description: hasPendingImages
        ? `Upload ${pendingImageIds.size} staged screenshot${
            pendingImageIds.size === 1 ? "" : "s"
          } and publish ${counts.total} project${
            counts.total === 1 ? "" : "s"
          } (${counts.live} Live, ${counts.draftOnly} Draft)?`
        : `Publish ${counts.total} project${
            counts.total === 1 ? "" : "s"
          } (${counts.live} Live, ${counts.draftOnly} Draft) immediately to your live portfolio?`,
      confirmLabel: "Save & Publish",
      variant: "primary",
      action: executeSave,
    });
  };

  const filterTabs: TabItem<ProjectFilterMode>[] = [
    { id: "all", label: "All", badge: counts.total },
    { id: "live", label: "Live", badge: counts.live },
    { id: "draft", label: "Drafts", badge: counts.draftOnly },
    { id: "featured", label: "Featured", badge: counts.featured },
  ];

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-6"
    >
      {/* Header & Sticky Save Bar */}
      <div
        data-cascade
        data-sticky-ceiling="true"
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4 sticky top-16 z-20 shadow-xl"
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <Briefcase
            className="w-5 h-5 text-(--text-accent) shrink-0 mt-0.5 sm:mt-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl uppercase tracking-tight text-(--text-primary)">
              Projects &amp; Case Studies
            </h2>
            <p className="text-xs text-(--text-muted)">
              {counts.total} Total · {counts.live} Live · {counts.draftOnly} Draft ·{" "}
              {counts.featured} Featured
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {liveErrorsCount > 0 && (
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={() => revealInvalidAndFollow("next")}
              className="h-10 px-3.5 font-mono text-[11px] bg-(--bg-badge-highlight) border-brand/45 text-(--text-accent) hover:bg-brand/22"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                {liveErrorsCount} {liveErrorsCount === 1 ? "Issue" : "Issues"} · Follow
              </span>
            </Button>
          )}

          {hasUnsavedChanges && (
            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={saving}
              onClick={handleDiscardDraft}
              className="h-10 px-4 font-mono text-xs bg-(--bg-surface-2)"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Discard</span>
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={saving}
            onClick={handleAddProject}
            className="h-10 px-4 font-mono text-xs"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Add Project</span>
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={saving}
            className="h-10 px-6 text-xs tracking-[0.16em]"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
            ) : (
              <Save className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            <span>Save &amp; Publish</span>
          </Button>
        </div>
      </div>

      {offline && (
        <AdminAlertBanner
          variant="offline"
          message="You are offline."
          detail="Project draft edits stay safe locally, but screenshot uploads and publishing require an active connection."
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
              ? () => revealInvalidAndFollow("first")
              : undefined
          }
          onDismiss={() => {
            setValidationBannerActive(false);
            setApiError(null);
          }}
        />
      )}

      {/* Clean Filter & Expand/Collapse Bar */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <Tabs
          items={filterTabs}
          value={filterMode}
          onChange={setFilterMode}
          ariaLabel="Filter project cards"
          size="sm"
          variant="accent"
        />

        <div className="flex items-center justify-between sm:justify-end gap-2">
          <span className="text-[11px] font-mono text-(--text-muted) uppercase tracking-widest">
            Showing {visibleEntries.length} of {draft.length}
          </span>

          {visibleEntries.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleExpandAllVisible}
              className="h-8 px-3 font-mono text-[11px]"
            >
              {allVisibleExpanded ? (
                <>
                  <ChevronsDownUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Collapse All</span>
                </>
              ) : (
                <>
                  <ChevronsUpDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Expand All</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible Project Cards with Cascade on Tab Navigate */}
      <TabPanel activeKey={filterMode}>
        {visibleEntries.length > 0 ? (
          <div className="space-y-4">
            {visibleEntries.map(({ project, index }) => {
              const projectErrors =
                liveValidation.errorsByProject[project.id] || [];
              const isTitleDuplicate =
                Boolean(project.title.trim()) &&
                duplicateTitleSet.has(project.title.trim().toLowerCase());
              const isImageDirty =
                Boolean(pendingFiles[project.id]) ||
                (savedImageById[project.id] !== undefined &&
                  savedImageById[project.id] !== project.image);

              return (
                <div
                  key={project.id}
                  data-cascade
                  data-project-id={project.id}
                >
                  <ProjectCardEditor
                    project={project}
                    index={index}
                    totalCount={draft.length}
                    expanded={Boolean(expandedIds[project.id])}
                    followOnExpand={!suppressExpandFollow}
                    forceTouched={forceTouched}
                    errors={projectErrors}
                    isTitleDuplicate={isTitleDuplicate}
                    isImageDirty={isImageDirty}
                    pendingImageFile={pendingFiles[project.id] || null}
                    newTechValue={newTechInputs[project.id] || ""}
                    techFeedback={techFeedbacks[project.id] || null}
                    onToggleExpand={() => handleToggleExpand(project.id)}
                    onMoveUp={() => handleMoveProject(index, -1)}
                    onMoveDown={() => handleMoveProject(index, 1)}
                    onDelete={() =>
                      handleDeleteProject(project.id, project.title)
                    }
                    onUpdateField={(field, value) =>
                      handleUpdateField(project.id, field, value)
                    }
                    onPendingImageChange={(file) =>
                      handlePendingImageChange(project.id, file)
                    }
                    onRevertImage={() => handleRevertImage(project.id)}
                    onUploadError={(message) => setApiError(message)}
                    onNewTechChange={(val) => {
                      setNewTechInputs((prev) => ({
                        ...prev,
                        [project.id]: val,
                      }));
                      if (techFeedbacks[project.id]) {
                        setTechFeedbacks((prev) => ({
                          ...prev,
                          [project.id]: null,
                        }));
                      }
                    }}
                    onAddTech={() => handleAddTech(project.id)}
                    onMoveTech={(techIdx, direction) =>
                      handleMoveTech(project.id, techIdx, direction)
                    }
                    onRemoveTech={(techIdx) =>
                      handleRemoveTech(project.id, techIdx)
                    }
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div
            data-cascade
            className="bg-(--bg-surface) border border-dashed border-(--border-subtle) rounded-sm p-10 flex flex-col items-center justify-center text-center gap-3"
          >
            <FolderOpen
              className="w-8 h-8 text-(--text-muted)"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium text-(--text-primary)">
                No projects match the &ldquo;{filterMode}&rdquo; filter
              </p>
              <p className="text-xs text-(--text-muted)">
                Switch back to view all {draft.length} portfolio projects.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setFilterMode("all")}
              className="font-mono text-xs"
            >
              Show All Projects
            </Button>
          </div>
        )}
      </TabPanel>

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
