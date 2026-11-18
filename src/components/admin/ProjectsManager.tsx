"use client";

import React, { useMemo, useRef, useState } from "react";
import { Project } from "@/types/portfolio";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DropdownPopover } from "@/components/ui/DropdownPopover";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tabs, TabItem } from "@/components/ui/Tabs";
import { TabPanel } from "@/components/ui/TabPanel";
import { AdminAlertBanner } from "@/components/admin/AdminAlertBanner";
import { AdminModuleHeaderBar } from "@/components/admin/AdminModuleHeaderBar";
import { ProjectCardEditor } from "@/components/admin/ProjectCardEditor";
import {
  ProjectDetailEditor,
  ProjectDetailStep,
  classifyProjectErrorStep,
} from "@/components/admin/ProjectDetailEditor";
import { AdminSlideView } from "@/components/motion/AdminMotion";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
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
  Briefcase,
  Check,
  ChevronDown,
  FolderOpen,
  ListFilter,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

function buildInitialTechIds(
  items: Project[],
  prefix = "init"
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const item of items) {
    map[item.id] = item.stack.map((_, i) => `tech-${item.id}-${prefix}-${i}`);
  }
  return map;
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
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [slideDirection, setSlideDirection] = useState<"forward" | "back">(
    "forward"
  );
  const [activeDetailStep, setActiveDetailStep] =
    useState<ProjectDetailStep>(0);
  const [filterMode, setFilterMode] = useState<ProjectFilterMode>("all");
  const [techIdsByProject, setTechIdsByProject] = useState<
    Record<string, string[]>
  >(() => buildInitialTechIds(projects));
  const nextTechKeyRef = useRef(0);
  const [newTechInputs, setNewTechInputs] = useState<Record<string, string>>(
    {}
  );
  const [techFeedbacks, setTechFeedbacks] = useState<
    Record<string, string | null>
  >({});

  const [saving, setSaving] = useState(false);
  const [forceTouched, setForceTouched] = useState(false);
  const [validationBannerActive, setValidationBannerActive] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const { scrollTo } = useSmoothScroll();
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

  const scrollViewToTop = () => {
    scrollTo(0, { immediate: true });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  };

  const handleOpenProject = (
    projectId: string,
    step: ProjectDetailStep = 0
  ) => {
    setSlideDirection("forward");
    setSelectedProjectId(projectId);
    setActiveDetailStep(step);
    scrollViewToTop();
  };

  const handleCloseProject = () => {
    setSlideDirection("back");
    setSelectedProjectId(null);
    scrollViewToTop();
  };

  const revealInvalidAndFollow = (mode: "first" | "next") => {
    setForceTouched(true);
    setValidationBannerActive(true);

    // If current view has an open project with errors, stay on it; otherwise drill into the first failing project
    const currentErrors = selectedProjectId
      ? liveValidation.errorsByProject[selectedProjectId] || []
      : [];

    if (currentErrors.length > 0 && selectedProjectId) {
      const targetStep = classifyProjectErrorStep(currentErrors[0]);
      if (targetStep !== activeDetailStep) {
        setActiveDetailStep(targetStep);
      }
    } else {
      const firstFailing = draft.find(
        (p) => (liveValidation.errorsByProject[p.id] || []).length > 0
      );
      if (firstFailing) {
        const errs = liveValidation.errorsByProject[firstFailing.id] || [];
        setFilterMode("all");
        setSlideDirection("forward");
        setSelectedProjectId(firstFailing.id);
        setActiveDetailStep(
          errs[0] ? classifyProjectErrorStep(errs[0]) : 0
        );
      }
    }

    window.setTimeout(() => {
      if (mode === "first") {
        followFirstInvalid(formRef.current);
      } else {
        followNextInvalid(formRef.current);
      }
    }, 330);
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

    const key = `tech-${projectId}-${nextTechKeyRef.current++}`;
    setDraft((prev) =>
      prev.map((item) =>
        item.id === projectId ? { ...item, stack: [...item.stack, raw] } : item
      )
    );
    setTechIdsByProject((prev) => ({
      ...prev,
      [projectId]: [
        ...(prev[projectId] || project.stack.map((_, i) => `t-${projectId}-${i}`)),
        key,
      ],
    }));
    setNewTechInputs((prev) => ({ ...prev, [projectId]: "" }));
    setTechFeedbacks((prev) => ({ ...prev, [projectId]: null }));
  };

  const handleUpdateTech = (
    projectId: string,
    techIdx: number,
    nextValue: string
  ) => {
    setDraft((prev) =>
      prev.map((item) => {
        if (item.id !== projectId) return item;
        const nextStack = [...item.stack];
        nextStack[techIdx] = nextValue;
        return { ...item, stack: nextStack };
      })
    );
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
    setTechIdsByProject((prev) => {
      const target = draft.find((item) => item.id === projectId);
      const current =
        prev[projectId] ||
        (target ? target.stack.map((_, i) => `t-${projectId}-${i}`) : []);
      return {
        ...prev,
        [projectId]: swapArrayItem(current, techIdx, direction),
      };
    });
  };

  const handleRemoveTech = (projectId: string, techIdx: number) => {
    setDraft((prev) =>
      prev.map((item) =>
        item.id === projectId
          ? { ...item, stack: item.stack.filter((_, idx) => idx !== techIdx) }
          : item
      )
    );
    setTechIdsByProject((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] || []).filter((_, idx) => idx !== techIdx),
    }));
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

    setFilterMode("all");
    setDraft((prev) => [...prev, newProject]);
    setTechIdsByProject((prev) => ({
      ...prev,
      [newId]: newProject.stack.map(
        (_, i) => `tech-${newId}-${nextTechKeyRef.current++}-${i}`
      ),
    }));
    handleOpenProject(newId, 0);
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
        if (selectedProjectId === projectId) {
          setSlideDirection("back");
          setSelectedProjectId(null);
        }
        setPendingFiles((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
        setTechIdsByProject((prev) => {
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
        const reverted = cloneProjects(savedBaseline);
        setDraft(reverted);
        setTechIdsByProject(
          buildInitialTechIds(reverted, `reset-${nextTechKeyRef.current++}`)
        );
        if (
          selectedProjectId &&
          !reverted.some((p) => p.id === selectedProjectId)
        ) {
          setSlideDirection("back");
          setSelectedProjectId(null);
        }
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

  const selectedProjectIndex = selectedProjectId
    ? draft.findIndex((item) => item.id === selectedProjectId)
    : -1;
  const selectedProject =
    selectedProjectIndex >= 0 ? draft[selectedProjectIndex] : null;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 sm:space-y-8"
    >
      {/* Header & Sticky Save Bar */}
      <AdminModuleHeaderBar
        dataCascade
        icon={<Briefcase className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />}
        title="Projects & Case Studies"
        tooltipLabel="Projects & case-study visibility"
        tooltipContent="Toggle Live vs Draft visibility, star Featured spotlight items, reorder systems, or expand any card to update architecture notes, stack tags, and cropped screenshots."
        subtitle={`${counts.total} Total · ${counts.live} Live · ${counts.draftOnly} Draft · ${counts.featured} Featured`}
        showSubtitleOnMobile
        liveErrorsCount={liveErrorsCount}
        onFollowIssue={() => revealInvalidAndFollow("next")}
        hasUnsavedChanges={hasUnsavedChanges}
        onDiscard={handleDiscardDraft}
        saving={saving}
        extraAction={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            fullWidth
            disabled={saving}
            onClick={handleAddProject}
            className="h-10 px-3 sm:px-4 font-mono"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Add Project</span>
          </Button>
        }
      />

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

      <div className="overflow-x-clip">
        <AdminSlideView
          activeKey={selectedProject ? `detail-${selectedProject.id}` : "list"}
          direction={slideDirection}
          distancePx={40}
          skipInitial
        >
          {selectedProject ? (
            <ProjectDetailEditor
              project={selectedProject}
              index={selectedProjectIndex}
              totalCount={draft.length}
              activeStep={activeDetailStep}
              onChangeStep={setActiveDetailStep}
            forceTouched={forceTouched}
            errors={liveValidation.errorsByProject[selectedProject.id] || []}
            isTitleDuplicate={
              Boolean(selectedProject.title.trim()) &&
              duplicateTitleSet.has(selectedProject.title.trim().toLowerCase())
            }
            isImageDirty={
              Boolean(pendingFiles[selectedProject.id]) ||
              (savedImageById[selectedProject.id] !== undefined &&
                savedImageById[selectedProject.id] !== selectedProject.image)
            }
            pendingImageFile={pendingFiles[selectedProject.id] || null}
            techIds={techIdsByProject[selectedProject.id] || []}
            newTechValue={newTechInputs[selectedProject.id] || ""}
            techFeedback={techFeedbacks[selectedProject.id] || null}
            onBack={handleCloseProject}
            onMoveUp={() => handleMoveProject(selectedProjectIndex, -1)}
            onMoveDown={() => handleMoveProject(selectedProjectIndex, 1)}
            onDelete={() =>
              handleDeleteProject(selectedProject.id, selectedProject.title)
            }
            onUpdateField={(field, value) =>
              handleUpdateField(selectedProject.id, field, value)
            }
            onPendingImageChange={(file) =>
              handlePendingImageChange(selectedProject.id, file)
            }
            onRevertImage={() => handleRevertImage(selectedProject.id)}
            onUploadError={(message) => setApiError(message)}
            onNewTechChange={(val) => {
              setNewTechInputs((prev) => ({
                ...prev,
                [selectedProject.id]: val,
              }));
              if (techFeedbacks[selectedProject.id]) {
                setTechFeedbacks((prev) => ({
                  ...prev,
                  [selectedProject.id]: null,
                }));
              }
            }}
            onAddTech={() => handleAddTech(selectedProject.id)}
            onUpdateTech={(techIdx, nextVal) =>
              handleUpdateTech(selectedProject.id, techIdx, nextVal)
            }
            onMoveTech={(techIdx, direction) =>
              handleMoveTech(selectedProject.id, techIdx, direction)
            }
            onRemoveTech={(techIdx) =>
              handleRemoveTech(selectedProject.id, techIdx)
            }
          />
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {/* Responsive Filter Bar */}
            <div
              data-cascade
              className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3 sm:px-5 sm:py-3.5 flex items-center justify-between gap-2.5 sm:gap-3"
            >
              {/* Mobile (< sm): Compact Pill Dropdown Filter avoiding multi-tab horizontal clipping */}
              <div className="sm:hidden min-w-0">
                <DropdownPopover
                  portal
                  align="start"
                  minWidth={210}
                  estimatedHeight={190}
                  trigger={({ isOpen, toggle }) => {
                    const activeFilter =
                      filterTabs.find((t) => t.id === filterMode) ??
                      filterTabs[0];
                    return (
                      <button
                        type="button"
                        onClick={toggle}
                        aria-label="Filter project cards"
                        aria-expanded={isOpen}
                        className={cn(
                          "h-9 px-3 rounded-full border text-xs font-mono inline-flex items-center gap-2 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                          isOpen
                            ? "border-brand bg-(--bg-badge-highlight) text-(--text-primary)"
                            : "border-(--border-strong) bg-(--bg-surface-2) text-(--text-primary) hover:border-brand/60"
                        )}
                      >
                        <ListFilter
                          className="w-3.5 h-3.5 text-(--text-accent) shrink-0"
                          aria-hidden="true"
                        />
                        <span className="uppercase tracking-wider font-medium">
                          {activeFilter.label}
                        </span>
                        <StatusPill
                          label={String(activeFilter.badge ?? 0)}
                          variant="accent"
                          size="xs"
                        />
                        <ChevronDown
                          className={cn(
                            "w-3.5 h-3.5 text-(--text-muted) transition-transform duration-200",
                            isOpen && "rotate-180 text-(--text-accent)"
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    );
                  }}
                >
                  {({ close }) => (
                    <div
                      role="menu"
                      aria-label="Filter project cards"
                      className="p-1.5 space-y-0.5 bg-(--bg-surface-elevated)"
                    >
                      {filterTabs.map((tab) => {
                        const selected = tab.id === filterMode;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={selected}
                            onClick={() => {
                              setFilterMode(tab.id);
                              close();
                            }}
                            className={cn(
                              "w-full px-2.5 py-2 rounded-(--radius-control) text-xs font-mono flex items-center justify-between gap-2 transition-colors cursor-pointer",
                              selected
                                ? "bg-(--bg-badge-highlight) text-(--text-accent) font-semibold"
                                : "text-(--text-primary) hover:bg-(--bg-surface-2)"
                            )}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Check
                                className={cn(
                                  "w-3.5 h-3.5",
                                  selected ? "opacity-100" : "opacity-0"
                                )}
                                aria-hidden="true"
                              />
                              <span className="uppercase tracking-wider">
                                {tab.label}
                              </span>
                            </span>
                            <StatusPill
                              label={String(tab.badge ?? 0)}
                              variant={selected ? "accent" : "neutral"}
                              size="xs"
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </DropdownPopover>
              </div>

              {/* Tablet & Desktop (>= sm): Full Gliding Segmented Tabs */}
              <div className="hidden sm:block">
                <Tabs
                  items={filterTabs}
                  value={filterMode}
                  onChange={setFilterMode}
                  ariaLabel="Filter project cards"
                  size="sm"
                  variant="accent"
                />
              </div>

              <span className="text-[11px] font-mono text-(--text-muted) uppercase tracking-widest shrink-0">
                Showing {visibleEntries.length} of {draft.length}
              </span>
            </div>

            {/* Project List Summary Cards with Cascade on Tab Navigate */}
            <TabPanel activeKey={filterMode}>
              {visibleEntries.length > 0 ? (
                <div className="space-y-4">
                  {visibleEntries.map(({ project, index }) => {
                    const projectErrors =
                      liveValidation.errorsByProject[project.id] || [];
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
                          forceTouched={forceTouched}
                          errors={projectErrors}
                          isImageDirty={isImageDirty}
                          pendingImageFile={pendingFiles[project.id] || null}
                          onOpenProject={() => handleOpenProject(project.id, 0)}
                          onMoveUp={() => handleMoveProject(index, -1)}
                          onMoveDown={() => handleMoveProject(index, 1)}
                          onDelete={() =>
                            handleDeleteProject(project.id, project.title)
                          }
                          onUpdateField={(field, value) =>
                            handleUpdateField(project.id, field, value)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  data-cascade
                  className="bg-(--bg-surface) border border-dashed border-(--border-subtle) rounded-(--radius-card) p-8 sm:p-10 flex flex-col items-center justify-center text-center gap-3"
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
          </div>
        )}
        </AdminSlideView>
      </div>

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
