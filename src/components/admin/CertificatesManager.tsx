"use client";

import React, { useMemo, useRef, useState } from "react";
import { Certificate, SectionHeaders } from "@/types/portfolio";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DropdownPopover } from "@/components/ui/DropdownPopover";
import { Tabs, TabItem } from "@/components/ui/Tabs";
import { TabPanel } from "@/components/ui/TabPanel";
import { AdminModuleHeaderBar } from "@/components/admin/AdminModuleHeaderBar";
import { CertificateCardEditor } from "@/components/admin/CertificateCardEditor";
import { CertificateDetailEditor } from "@/components/admin/CertificateDetailEditor";
import { AdminSlideView } from "@/components/motion/AdminMotion";
import { Collapsible } from "@/components/motion/Collapsible";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { TextField } from "@/components/ui/fields/TextField";
import {
  announceBrandPortalStatus,
  useBrandPortalWorkspaceSync,
} from "@/lib/brandPortalStatus";
import {
  isNetworkOffline,
  useOfflineStatus,
} from "@/components/pwa/OfflineManager";
import { uploadImageToAdminApi } from "@/lib/instantImageCache";
import { swapArrayItem } from "@/lib/utils";
import { validateCertificatesDraft } from "@/lib/validation";
import {
  Award,
  Check,
  ChevronDown,
  FolderOpen,
  ListFilter,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CertificatesManagerProps {
  certificates: Certificate[];
  sectionHeaders: SectionHeaders;
  onSave: (payload: {
    certificates: Certificate[];
    sectionHeaders: SectionHeaders;
  }) => Promise<void>;
}

type CertificateFilterMode = "all" | "live" | "draft" | "featured";

interface ConfirmState {
  title: string;
  description: string;
  confirmLabel: string;
  variant: "primary" | "danger";
  action: () => Promise<void> | void;
}

const CATEGORY_OPTIONS = [
  { id: "all", label: "All Categories" },
  { id: "academic", label: "Academic Honors" },
  { id: "analytics", label: "Business Analytics" },
  { id: "fullstack", label: "Full-Stack" },
  { id: "industry", label: "Industry" },
] as const;

function cloneCertificates(items: Certificate[]): Certificate[] {
  return items.map((item) => ({
    ...item,
    skills: [...(item.skills || [])],
  }));
}

function buildSignature(
  certs: Certificate[],
  headers: SectionHeaders
): string {
  return JSON.stringify({
    certs: certs.map((c) => ({
      id: c.id,
      title: c.title,
      issuer: c.issuer,
      issueDate: c.issueDate,
      expiryDate: c.expiryDate,
      category: c.category,
      credentialId: c.credentialId,
      description: c.description,
      skills: c.skills,
      fileUrl: c.fileUrl,
      fileType: c.fileType,
      featured: Boolean(c.featured),
      published: c.published !== false,
      order: c.order,
    })),
    headers: {
      certificatesEyebrow: headers.certificatesEyebrow,
      certificatesHeading: headers.certificatesHeading,
      certificatesSubtitle: headers.certificatesSubtitle,
    },
  });
}

export function CertificatesManager({
  certificates,
  sectionHeaders,
  onSave,
}: CertificatesManagerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const { isOnline } = useOfflineStatus();
  const { scrollTo } = useSmoothScroll();

  const [savedBaseline, setSavedBaseline] = useState<Certificate[]>(() =>
    cloneCertificates(certificates)
  );
  const [draft, setDraft] = useState<Certificate[]>(() =>
    cloneCertificates(certificates)
  );

  const [savedHeaders, setSavedHeaders] = useState<SectionHeaders>(() => ({
    ...sectionHeaders,
  }));
  const [draftHeaders, setDraftHeaders] = useState<SectionHeaders>(() => ({
    ...sectionHeaders,
  }));

  const [savedSignature, setSavedSignature] = useState<string>(() =>
    buildSignature(certificates, sectionHeaders)
  );

  const [pendingFiles, setPendingFiles] = useState<Record<string, File | null>>(
    {}
  );
  const [selectedCertId, setSelectedCertId] = useState<string | null>(null);
  const [slideDirection, setSlideDirection] = useState<"forward" | "back">(
    "forward"
  );
  const [filterMode, setFilterMode] = useState<CertificateFilterMode>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [saving, setSaving] = useState(false);
  const [headersExpanded, setHeadersExpanded] = useState(false);

  const selectedCert = useMemo(
    () => (selectedCertId ? draft.find((c) => c.id === selectedCertId) : null),
    [draft, selectedCertId]
  );

  const selectedCertIndex = useMemo(
    () => (selectedCertId ? draft.findIndex((c) => c.id === selectedCertId) : -1),
    [draft, selectedCertId]
  );

  const hasPendingFiles = useMemo(
    () => Object.values(pendingFiles).some(Boolean),
    [pendingFiles]
  );

  const currentSignature = useMemo(
    () => buildSignature(draft, draftHeaders),
    [draft, draftHeaders]
  );

  const hasUnsavedChanges =
    currentSignature !== savedSignature || hasPendingFiles;

  const pendingFileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, f] of Object.entries(pendingFiles)) {
      if (f) ids.add(id);
    }
    return ids;
  }, [pendingFiles]);

  const liveValidation = useMemo(
    () => validateCertificatesDraft(draft, pendingFileIds),
    [draft, pendingFileIds]
  );

  const liveErrorsCount = liveValidation.errors.length;

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
    return draft
      .map((cert, index) => ({ cert, index }))
      .filter(({ cert }) => {
        if (filterMode === "live" && cert.published === false) return false;
        if (filterMode === "draft" && cert.published !== false) return false;
        if (filterMode === "featured" && !cert.featured) return false;
        if (selectedCategory !== "all" && cert.category !== selectedCategory)
          return false;
        return true;
      });
  }, [draft, filterMode, selectedCategory]);

  const handleOpenCert = (id: string) => {
    setSelectedCertId(id);
    setSlideDirection("forward");
    scrollTo(0, { immediate: true });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  };

  const handleCloseCert = () => {
    setSelectedCertId(null);
    setSlideDirection("back");
    scrollTo(0, { immediate: true });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  };

  const handleAddCert = () => {
    const newId = `cert-${Date.now()}`;
    const newCert: Certificate = {
      id: newId,
      title: "New Credential",
      issuer: "Issuing Organization",
      issueDate: new Date().toISOString().slice(0, 7),
      category: "analytics",
      skills: [],
      fileUrl: "/images/certificates/sample-certificate.webp",
      fileType: "image",
      featured: false,
      published: true,
      order: draft.length,
    };
    setDraft((prev) => [newCert, ...prev]);
    setSelectedCertId(newId);
    setSlideDirection("forward");
    scrollTo(0, { immediate: true });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    setDraft((prev) => swapArrayItem(prev, index, direction));
  };

  const handleTogglePublished = (id: string) => {
    setDraft((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, published: c.published === false } : c
      )
    );
  };

  const handleToggleFeatured = (id: string) => {
    setDraft((prev) =>
      prev.map((c) => (c.id === id ? { ...c, featured: !c.featured } : c))
    );
  };

  const handleDelete = (id: string, title: string) => {
    setConfirmState({
      title: "Delete Credential?",
      description: `Remove "${title || "Untitled Certificate"}" from the certificates collection? This will be staged until you save.`,
      confirmLabel: "Delete Credential",
      variant: "danger",
      action: () => {
        setDraft((prev) => prev.filter((c) => c.id !== id));
        setPendingFiles((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        if (selectedCertId === id) {
          setSelectedCertId(null);
          setSlideDirection("back");
          scrollTo(0, { immediate: true });
          if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          }
        }
      },
    });
  };

  const handleUpdateField = <K extends keyof Certificate>(
    id: string,
    field: K,
    value: Certificate[K]
  ) => {
    setDraft((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const handlePendingFileChange = (id: string, file: File | null) => {
    setPendingFiles((prev) => ({
      ...prev,
      [id]: file,
    }));
  };

  const handleDiscardDraft = () => {
    setConfirmState({
      title: "Discard Unsaved Certificate Changes?",
      description:
        "Revert all unsaved certificate edits, staged documents, and section header changes back to your last saved state?",
      confirmLabel: "Discard Changes",
      variant: "danger",
      action: () => {
        const revertedCerts = cloneCertificates(savedBaseline);
        const revertedHeaders = { ...savedHeaders };
        setDraft(revertedCerts);
        setDraftHeaders(revertedHeaders);
        setPendingFiles({});
        if (selectedCertId && !revertedCerts.some((c) => c.id === selectedCertId)) {
          setSelectedCertId(null);
          setSlideDirection("back");
        }
        announceBrandPortalStatus({
          tone: "synced",
          label: "Changes Discarded",
          detail: "Certificates reverted to last saved state",
        });
      },
    });
  };

  const executeSave = async () => {
    if (isNetworkOffline(isOnline)) {
      setConfirmState(null);
      announceBrandPortalStatus({
        tone: "offline",
        label: "Offline",
        detail: "Reconnect to publish certificates",
      });
      return;
    }

    setSaving(true);
    announceBrandPortalStatus({
      tone: "saving",
      label: "Publishing...",
      detail: hasPendingFiles
        ? "Uploading staged certificate files & saving..."
        : "Saving Certificates & Accreditations...",
    });

    try {
      const cleanedCertificates: Certificate[] = [];

      for (let i = 0; i < draft.length; i++) {
        const cert = draft[i];
        let resolvedFileUrl = cert.fileUrl.trim();
        const stagedFile = pendingFiles[cert.id];

        if (stagedFile) {
          resolvedFileUrl = await uploadImageToAdminApi(
            stagedFile,
            "certificates"
          );
        }

        const effectiveFileType =
          stagedFile?.type === "application/pdf" ||
          resolvedFileUrl.toLowerCase().endsWith(".pdf")
            ? "pdf"
            : "image";

        cleanedCertificates.push({
          ...cert,
          title: cert.title.trim(),
          issuer: cert.issuer.trim(),
          issueDate: cert.issueDate.trim(),
          expiryDate: cert.expiryDate?.trim() || undefined,
          credentialId: cert.credentialId?.trim() || undefined,
          description: cert.description?.trim() || undefined,
          skills: (cert.skills || []).map((s) => s.trim()).filter(Boolean),
          fileUrl: resolvedFileUrl,
          fileType: effectiveFileType,
          featured: Boolean(cert.featured),
          published: cert.published !== false,
          order: i,
        });
      }

      const cleanedHeaders: SectionHeaders = {
        ...draftHeaders,
        certificatesEyebrow: (
          draftHeaders.certificatesEyebrow || "CH // 03 · Certified Competence"
        ).trim(),
        certificatesHeading: (
          draftHeaders.certificatesHeading || "CREDENTIALS & RECOGNITIONS."
        ).trim(),
        certificatesSubtitle: (
          draftHeaders.certificatesSubtitle ||
          "Academic honors, applied business analytics credentials, and engineering certifications."
        ).trim(),
      };

      await onSave({
        certificates: cleanedCertificates,
        sectionHeaders: cleanedHeaders,
      });

      const cleanCertsBaseline = cloneCertificates(cleanedCertificates);
      setDraft(cleanCertsBaseline);
      setSavedBaseline(cloneCertificates(cleanCertsBaseline));
      setSavedHeaders({ ...cleanedHeaders });
      setDraftHeaders({ ...cleanedHeaders });
      setSavedSignature(buildSignature(cleanCertsBaseline, cleanedHeaders));
      setPendingFiles({});
      setConfirmState(null);

      announceBrandPortalStatus({
        tone: "live",
        label: "Saved & Live!",
        detail: `${cleanedCertificates.length} credentials published`,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save certificates.";
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
      announceBrandPortalStatus({
        tone: "error",
        label: "Check Fields",
        detail: liveValidation.errors[0] || "Review certificate fields",
      });
      return;
    }

    setConfirmState({
      title: "Save & Publish Certificates?",
      description: hasPendingFiles
        ? `Upload ${pendingFileIds.size} staged certificate document${
            pendingFileIds.size === 1 ? "" : "s"
          } and publish ${counts.total} credentials (${counts.live} Live)?`
        : `Publish ${counts.total} credentials (${counts.live} Live) to your portfolio?`,
      confirmLabel: "Save & Publish",
      variant: "primary",
      action: executeSave,
    });
  };

  useBrandPortalWorkspaceSync({
    moduleId: "certificates",
    moduleLabel: "Certificates",
    hasUnsavedChanges,
    saving,
    validationErrorCount: hasUnsavedChanges ? liveErrorsCount : 0,
    onSave: () => formRef.current?.requestSubmit(),
    onDiscard: handleDiscardDraft,
  });

  const filterTabs: TabItem<CertificateFilterMode>[] = [
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
      className="space-y-4 sm:space-y-8"
    >
      {/* Clean Module Header matching Projects CRUD */}
      <AdminModuleHeaderBar
        dataCascade
        icon={<Award className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />}
        title="Certificates & Accreditations"
        tooltipLabel="Credentials visibility & layout"
        tooltipContent="Toggle Live vs Draft visibility, star Featured spotlight items, reorder credentials, or edit issuing authority and preview documents."
        subtitle={`${counts.total} Total · ${counts.live} Live · ${counts.draftOnly} Draft · ${counts.featured} Featured`}
        showSubtitleOnMobile
        extraAction={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            fullWidth
            disabled={saving}
            onClick={handleAddCert}
            className="h-10 px-3 sm:px-4 font-mono"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Add Credential</span>
          </Button>
        }
      />

      <div className="overflow-x-clip">
        <AdminSlideView
          activeKey={selectedCert ? `detail-${selectedCert.id}` : "list"}
          direction={slideDirection}
          distancePx={40}
          skipInitial
        >
          {selectedCert ? (
            <CertificateDetailEditor
              certificate={selectedCert}
              index={selectedCertIndex}
              totalCount={draft.length}
              errors={liveValidation.errorsByCert[selectedCert.id] || []}
              isDirty={Boolean(pendingFiles[selectedCert.id])}
              pendingFile={pendingFiles[selectedCert.id] || null}
              onBack={handleCloseCert}
              onDelete={() => handleDelete(selectedCert.id, selectedCert.title)}
              onUpdateField={(field, value) =>
                handleUpdateField(selectedCert.id, field, value)
              }
              onPendingFileChange={(file) =>
                handlePendingFileChange(selectedCert.id, file)
              }
            />
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {/* Chapter 03 Section Headers Collapsible Accordion */}
              <div
                data-cascade
                className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) overflow-hidden shadow-xs"
              >
                <button
                  type="button"
                  onClick={() => setHeadersExpanded((prev) => !prev)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-(--bg-surface-2) transition-colors cursor-pointer select-none"
                  aria-expanded={headersExpanded}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-brand" />
                    <div>
                      <h3 className="text-sm font-semibold text-(--text-primary)">
                        Chapter 03 Section Headers
                      </h3>
                      <p className="text-xs text-(--text-muted) font-mono">
                        {draftHeaders.certificatesEyebrow ||
                          "CH // 03 · Certified Competence"}{" "}
                        ·{" "}
                        {draftHeaders.certificatesHeading ||
                          "CREDENTIALS & RECOGNITIONS."}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-(--text-muted) transition-transform duration-300",
                      headersExpanded && "rotate-180 text-(--text-accent)"
                    )}
                    aria-hidden="true"
                  />
                </button>

                <Collapsible
                  open={headersExpanded}
                  followOnOpen
                  allowOverflowWhenOpen
                >
                  <div className="p-4 sm:p-6 border-t border-(--border-subtle) bg-(--bg-surface-2)/50 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <TextField
                        label="Section Eyebrow Tag"
                        value={draftHeaders.certificatesEyebrow || ""}
                        onChange={(v) =>
                          setDraftHeaders((prev) => ({
                            ...prev,
                            certificatesEyebrow: v,
                          }))
                        }
                        placeholder="CH // 03 · Certified Competence"
                        maxLength={60}
                      />
                      <TextField
                        label="Main Headline"
                        value={draftHeaders.certificatesHeading || ""}
                        onChange={(v) =>
                          setDraftHeaders((prev) => ({
                            ...prev,
                            certificatesHeading: v,
                          }))
                        }
                        placeholder="CREDENTIALS & RECOGNITIONS."
                        maxLength={80}
                      />
                    </div>
                    <TextField
                      label="Subtitle Description"
                      value={draftHeaders.certificatesSubtitle || ""}
                      onChange={(v) =>
                        setDraftHeaders((prev) => ({
                          ...prev,
                          certificatesSubtitle: v,
                        }))
                      }
                      placeholder="Academic honors, applied business analytics credentials, and engineering certifications."
                      maxLength={200}
                    />
                  </div>
                </Collapsible>
              </div>

              {/* Responsive Filter Bar matching Projects CRUD */}
              <div
                data-cascade
                className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3 sm:px-5 sm:py-3.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3"
              >
                {/* Mobile (< sm): Compact Pill Dropdown Filter avoiding clipping */}
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
                          aria-label="Filter certificate cards"
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
                          <span className="text-[11px] font-mono text-(--text-accent) tabular-nums">
                            ({activeFilter.badge ?? 0})
                          </span>
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
                        aria-label="Filter certificate cards"
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
                              <span className="text-[11px] font-mono text-(--text-muted) tabular-nums">
                                {tab.badge ?? 0}
                              </span>
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
                    ariaLabel="Filter certificate cards"
                    size="sm"
                    variant="accent"
                  />
                </div>

                {/* Category Reusable Dropdown Popover & Count Summary */}
                <div className="flex items-center gap-3">
                  <DropdownPopover
                    portal
                    align="end"
                    minWidth={200}
                    estimatedHeight={210}
                    trigger={({ isOpen, toggle }) => {
                      const activeCat =
                        CATEGORY_OPTIONS.find((c) => c.id === selectedCategory) ??
                        CATEGORY_OPTIONS[0];
                      return (
                        <button
                          type="button"
                          onClick={toggle}
                          aria-label="Filter by certificate category"
                          aria-expanded={isOpen}
                          className={cn(
                            "h-9 px-3 rounded-full border text-xs font-mono inline-flex items-center gap-2 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                            isOpen
                              ? "border-brand bg-(--bg-badge-highlight) text-(--text-primary)"
                              : "border-(--border-strong) bg-(--bg-surface-2) text-(--text-primary) hover:border-brand/60"
                          )}
                        >
                          <span className="text-[11px] uppercase tracking-wider font-medium text-(--text-muted) hidden sm:inline">
                            Category:
                          </span>
                          <span className="font-medium">{activeCat.label}</span>
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
                        aria-label="Select certificate category"
                        className="p-1.5 space-y-0.5 bg-(--bg-surface-elevated)"
                      >
                        {CATEGORY_OPTIONS.map((cat) => {
                          const isSelected = cat.id === selectedCategory;
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              role="menuitemradio"
                              aria-checked={isSelected}
                              onClick={() => {
                                setSelectedCategory(cat.id);
                                close();
                              }}
                              className={cn(
                                "w-full px-2.5 py-2 rounded-(--radius-control) text-xs font-mono flex items-center justify-between gap-2 transition-colors cursor-pointer",
                                isSelected
                                  ? "bg-(--bg-badge-highlight) text-(--text-accent) font-semibold"
                                  : "text-(--text-primary) hover:bg-(--bg-surface-2)"
                              )}
                            >
                              <span className="inline-flex items-center gap-2">
                                <Check
                                  className={cn(
                                    "w-3.5 h-3.5",
                                    isSelected ? "opacity-100" : "opacity-0"
                                  )}
                                  aria-hidden="true"
                                />
                                <span className="uppercase tracking-wider">
                                  {cat.label}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </DropdownPopover>

                  <span className="text-[11px] font-mono text-(--text-muted) uppercase tracking-widest shrink-0">
                    Showing {visibleEntries.length} of {draft.length}
                  </span>
                </div>
              </div>

              {/* Certificate Summary Card List with Cascade on Tab Navigate */}
              <TabPanel activeKey={filterMode}>
                {visibleEntries.length > 0 ? (
                  <div className="space-y-4">
                    {visibleEntries.map(({ cert, index }) => {
                      const certErrors =
                        liveValidation.errorsByCert[cert.id] || [];
                      const isDirty = Boolean(pendingFiles[cert.id]);

                      return (
                        <div
                          key={cert.id}
                          data-cascade
                          data-certificate-id={cert.id}
                        >
                          <CertificateCardEditor
                            certificate={cert}
                            index={index}
                            totalCount={draft.length}
                            errors={certErrors}
                            isDirty={isDirty}
                            pendingFile={pendingFiles[cert.id] || null}
                            onEdit={() => handleOpenCert(cert.id)}
                            onMoveUp={() => handleMove(index, -1)}
                            onMoveDown={() => handleMove(index, 1)}
                            onDelete={() => handleDelete(cert.id, cert.title)}
                            onTogglePublished={() =>
                              handleTogglePublished(cert.id)
                            }
                            onToggleFeatured={() =>
                              handleToggleFeatured(cert.id)
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
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-(--text-primary)">
                      No credentials found
                    </h4>
                    <p className="text-xs text-(--text-muted) max-w-sm">
                      {filterMode !== "all" || selectedCategory !== "all"
                        ? "No certificates match the active filter criteria."
                        : "Add your first degree, honor, or industry certification to showcase here."}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddCert}
                      className="mt-2 text-xs gap-1.5 font-mono"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Credential</span>
                    </Button>
                  </div>
                )}
              </TabPanel>
            </div>
          )}
        </AdminSlideView>
      </div>

      {/* Confirmation Modal */}
      {confirmState && (
        <ConfirmModal
          open={Boolean(confirmState)}
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          variant={confirmState.variant}
          loading={saving}
          onConfirm={async () => {
            await confirmState.action();
            setConfirmState(null);
          }}
          onCancel={() => {
            if (!saving) setConfirmState(null);
          }}
        />
      )}
    </form>
  );
}
