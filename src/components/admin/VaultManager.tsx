"use client";

import React, { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { VaultCategory, VaultDocument, VaultStats } from "@/types/vault";
import { AdminModuleHeaderBar } from "@/components/admin/AdminModuleHeaderBar";
import {
  VaultDocumentCard,
  getCategoryVariant,
  getCategoryIcon,
} from "@/components/admin/vault/VaultDocumentCard";
import { VaultViewerModal } from "@/components/admin/vault/VaultViewerModal";
import { VaultEditModal } from "@/components/admin/vault/VaultEditModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DropdownPopover } from "@/components/ui/DropdownPopover";
import { Tabs, TabItem } from "@/components/ui/Tabs";
import { TabPanel } from "@/components/ui/TabPanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { IconActionButton } from "@/components/ui/ActionButtons";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { InfoTooltip, Tooltip } from "@/components/ui/Tooltip";
import { AnimatedCounter } from "@/components/motion/AdminMotion";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import {
  ArrowUpDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  Edit2,
  Eye,
  FolderOpen,
  Grid,
  HardDrive,
  List,
  ListFilter,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_STORAGE_BYTES = 500 * 1024 * 1024; // 500 MB capacity
const EMPTY_DOCUMENTS: VaultDocument[] = [];
const DEFAULT_STATS: VaultStats = {
  totalFiles: 0,
  totalDocuments: 0,
  totalSizeBytes: 0,
  categoryCounts: {
    academic: 0,
    government: 0,
    career: 0,
    legal: 0,
    personal: 0,
  },
  byCategory: {
    academic: 0,
    government: 0,
    career: 0,
    legal: 0,
    personal: 0,
  },
};

const CATEGORIES: {
  id: VaultCategory;
  label: string;
}[] = [
  { id: "academic", label: "Academic Records" },
  { id: "government", label: "Government IDs" },
  { id: "career", label: "Career & Contracts" },
  { id: "legal", label: "Legal & Financial" },
  { id: "personal", label: "Personal Files" },
];

const SORT_OPTIONS = [
  { id: "date-desc", label: "Newest First" },
  { id: "date-asc", label: "Oldest First" },
  { id: "name", label: "Name (A-Z)" },
  { id: "size", label: "Size (Largest)" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["id"];

const VIEW_MODE_OPTIONS = [
  { id: "grid", label: "Grid View", icon: <Grid className="w-3.5 h-3.5" /> },
  { id: "table", label: "Table View", icon: <List className="w-3.5 h-3.5" /> },
] as const;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function VaultManager() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeCategory, setActiveCategory] = useState<VaultCategory | "all">(
    "all"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [sortBy, setSortBy] = useState<SortOption>("date-desc");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCategory, setUploadCategory] =
    useState<VaultCategory>("personal");

  // Modals state
  const [previewDoc, setPreviewDoc] = useState<VaultDocument | null>(null);
  const [editingDoc, setEditingDoc] = useState<VaultDocument | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<VaultDocument | null>(null);

  // 1. Load Vault Documents & Stats
  const vaultQuery = useQuery({
    queryKey: queryKeys.adminVault,
    queryFn: async (): Promise<{
      documents: VaultDocument[];
      stats: VaultStats;
    }> => {
      const res = await fetch("/api/admin/vault", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load vault documents (HTTP ${res.status})`);
      }
      return res.json();
    },
    staleTime: 15 * 1000,
  });

  const documents = vaultQuery.data?.documents ?? EMPTY_DOCUMENTS;
  const stats = vaultQuery.data?.stats ?? DEFAULT_STATS;

  const categoryMap = useMemo(() => {
    return (
      stats.byCategory ||
      stats.categoryCounts || {
        academic: 0,
        government: 0,
        career: 0,
        legal: 0,
        personal: 0,
      }
    );
  }, [stats.byCategory, stats.categoryCounts]);

  // 2. Upload Mutation
  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    announceBrandPortalStatus({
      tone: "saving",
      label: "Vault Upload",
      detail: `Encrypting & storing ${files.length} document(s)...`,
    });

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
        formData.append("category", uploadCategory);

        const res = await fetch("/api/admin/vault", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || `Failed to upload ${file.name}`);
        }
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.adminVault });
      announceBrandPortalStatus({
        tone: "live",
        label: "Upload Complete",
        detail: `Successfully stored ${files.length} document(s) in Vault`,
      });
    } catch (err) {
      announceBrandPortalStatus({
        tone: "error",
        label: "Upload Failed",
        detail: err instanceof Error ? err.message : "Document upload failed",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 3. Edit Metadata Mutation
  const editMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      title: string;
      category: VaultCategory;
      tags: string[];
      notes?: string;
      pinned: boolean;
    }) => {
      const res = await fetch("/api/admin/vault", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData?.error || "Failed to update document metadata."
        );
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminVault });
      announceBrandPortalStatus({
        tone: "live",
        label: "Metadata Updated",
        detail: "Document changes saved in vault registry",
      });
    },
    onError: (err) => {
      announceBrandPortalStatus({
        tone: "error",
        label: "Update Failed",
        detail: err instanceof Error ? err.message : "Failed to update metadata",
      });
    },
  });

  // 4. Pin Toggle Mutation
  const handleTogglePin = async (doc: VaultDocument) => {
    try {
      await editMutation.mutateAsync({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        tags: doc.tags || [],
        notes: doc.notes,
        pinned: !doc.pinned,
      });
    } catch {
      // Handled by onError
    }
  };

  // 5. Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/vault?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData?.error || "Failed to delete document from vault."
        );
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminVault });
      announceBrandPortalStatus({
        tone: "live",
        label: "Document Removed",
        detail: "File and cryptographic records deleted",
      });
    },
    onError: (err) => {
      announceBrandPortalStatus({
        tone: "error",
        label: "Delete Failed",
        detail: err instanceof Error ? err.message : "Failed to delete document",
      });
    },
  });

  // Filter & Sort
  const filteredDocuments = useMemo(() => {
    let result = documents;

    if (activeCategory !== "all") {
      result = result.filter((d) => d.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.originalFilename ?? d.originalFileName ?? "")
            .toLowerCase()
            .includes(q) ||
          (d.tags && d.tags.some((t) => t.toLowerCase().includes(q))) ||
          (d.notes && d.notes.toLowerCase().includes(q))
      );
    }

    return [...result].sort((a, b) => {
      // Pinned documents always float to the top
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      switch (sortBy) {
        case "date-asc":
          return (
            new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
          );
        case "name":
          return a.title.localeCompare(b.title);
        case "size":
          return (
            (b.fileSize ?? b.fileSizeBytes ?? 0) -
            (a.fileSize ?? a.fileSizeBytes ?? 0)
          );
        case "date-desc":
        default:
          return (
            new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
          );
      }
    });
  }, [documents, activeCategory, searchQuery, sortBy]);

  const storageUsagePercent = Math.min(
    100,
    Math.round((stats.totalSizeBytes / MAX_STORAGE_BYTES) * 100)
  );

  const filterTabs: TabItem<VaultCategory | "all">[] = useMemo(() => {
    return [
      { id: "all", label: "All", badge: documents.length },
      { id: "academic", label: "Academic", badge: categoryMap.academic || 0 },
      {
        id: "government",
        label: "Government",
        badge: categoryMap.government || 0,
      },
      { id: "career", label: "Career", badge: categoryMap.career || 0 },
      { id: "legal", label: "Legal", badge: categoryMap.legal || 0 },
      { id: "personal", label: "Personal", badge: categoryMap.personal || 0 },
    ];
  }, [documents.length, categoryMap]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Top Header Bar matching Projects & Certificates CRUD */}
      <AdminModuleHeaderBar
        dataCascade
        icon={<HardDrive className="w-4 h-4 sm:w-5 sm:h-5 text-(--text-accent)" />}
        title="Personal Document Vault (My Drive)"
        tooltipLabel="Encrypted Private Cloud Storage"
        tooltipContent="Store, view, and organize official records, diplomas, transcripts of records (TOR), government IDs, contracts, and certifications with AES-256 server-side encryption."
        subtitle={`${documents.length} Total Documents · ${formatBytes(
          stats.totalSizeBytes
        )} of ${formatBytes(MAX_STORAGE_BYTES)} Used`}
        showSubtitleOnMobile
        extraAction={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            fullWidth
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="h-10 px-3 sm:px-4 font-mono"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Upload Document</span>
          </Button>
        }
      />

      {/* Row 1: Executive Matrix & Command Split (matching Overview Dashboard layout exactly) */}
      <div
        data-cascade
        className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch"
      >
        {/* Left Anchor: 1-Card Document & Storage Matrix (xl:col-span-7) */}
        <div className="xl:col-span-7 flex flex-col [&>section]:flex-1">
          <section
            aria-label="Vault Storage Matrix"
            className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) overflow-hidden shadow-lg h-full"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-px bg-(--border-subtle) h-full">
              {/* Left Hero Anchor: Primary Metric with Circular Icon Badge */}
              <div className="md:col-span-6 bg-(--bg-surface) p-4 sm:p-5 flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono uppercase tracking-[0.16em] font-semibold text-(--text-primary) truncate">
                        Total Vault Files
                      </span>
                      <InfoTooltip
                        label="Vault document storage"
                        content="Real-time document count and AES-256-GCM encrypted byte volume stored in your private drive vault."
                      />
                    </div>
                    <p className="text-[10.5px] font-mono text-(--text-muted) truncate mt-0.5">
                      {formatBytes(stats.totalSizeBytes)} of{" "}
                      {formatBytes(MAX_STORAGE_BYTES)} used ({storageUsagePercent}%)
                    </p>
                  </div>

                  <span className="w-8 h-8 rounded-full bg-(--bg-badge-highlight) border border-brand/35 flex items-center justify-center text-(--text-accent) shrink-0">
                    <HardDrive className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                </div>

                <div className="space-y-2.5 my-auto">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-display text-5xl sm:text-6xl xl:text-[4.25rem] text-(--text-primary) leading-none tracking-tight">
                      <AnimatedCounter
                        value={
                          stats.totalFiles ??
                          stats.totalDocuments ??
                          documents.length
                        }
                        durationMs={850}
                      />
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 border border-emerald-500/30 font-mono text-emerald-400 tabular-nums px-2 py-0.5 text-[10.5px]">
                      <ShieldCheck className="w-2.5 h-2.5 shrink-0" />
                      AES-256 GCM
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] font-mono text-(--text-muted)">
                    <span>
                      Allocated{" "}
                      <strong className="text-(--text-primary) tabular-nums">
                        500 MB
                      </strong>
                    </span>
                    <span aria-hidden="true" className="text-(--border-strong)">
                      ·
                    </span>
                    <span>
                      Used{" "}
                      <strong className="text-(--text-primary) tabular-nums">
                        {formatBytes(stats.totalSizeBytes)}
                      </strong>
                    </span>
                    <span aria-hidden="true" className="text-(--border-strong)">
                      ·
                    </span>
                    <span>
                      Free{" "}
                      <strong className="text-(--text-primary) tabular-nums">
                        {formatBytes(
                          Math.max(0, MAX_STORAGE_BYTES - stats.totalSizeBytes)
                        )}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-(--border-subtle)/60">
                  <div className="flex items-center justify-between text-[9.5px] font-mono uppercase tracking-[0.14em] text-(--text-muted) mb-1.5">
                    <span>Storage Capacity Bar</span>
                    <span className="tabular-nums">{storageUsagePercent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-(--bg-surface-2) overflow-hidden border border-(--border-subtle)">
                    <div
                      className="h-full bg-gradient-to-r from-brand to-amber-500 transition-all duration-500 rounded-full"
                      style={{
                        width: `${Math.max(2, storageUsagePercent)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Right Stack: 4 Interactive Companion Category Rows matching AnalyticsKpiGrid */}
              <div className="md:col-span-6 flex flex-col gap-px bg-(--border-subtle)">
                {[
                  {
                    cat: "academic" as const,
                    label: "Academic Records",
                    hint: "TOR, Diplomas, Transcripts",
                    count: categoryMap.academic || 0,
                  },
                  {
                    cat: "government" as const,
                    label: "Government IDs",
                    hint: "Passports, Clearances, Valid IDs",
                    count: categoryMap.government || 0,
                  },
                  {
                    cat: "career" as const,
                    label: "Career & Contracts",
                    hint: "Employment, NDAs, COE, Offers",
                    count: categoryMap.career || 0,
                  },
                  {
                    cat: "legal" as const,
                    label: "Legal & Personal",
                    hint: "Tax, Legal, Medical, Private",
                    count:
                      (categoryMap.legal || 0) + (categoryMap.personal || 0),
                  },
                ].map(({ cat, label, hint, count }) => {
                  const isSelected = activeCategory === cat;
                  return (
                    <div
                      key={cat}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveCategory(cat)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveCategory(cat);
                        }
                      }}
                      className={cn(
                        "flex-1 text-left bg-(--bg-surface) hover:bg-(--bg-surface-2)/75 px-4 py-3 flex flex-col justify-between gap-1.5 cursor-pointer transition-colors duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand select-none relative overflow-hidden border-l-2 border-l-transparent",
                        isSelected &&
                          "bg-(--bg-surface-2) border-l-brand"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 text-(--text-muted) w-full">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={cn(
                              "text-[10.5px] font-mono uppercase tracking-[0.15em] truncate transition-colors",
                              isSelected
                                ? "text-(--text-accent) font-semibold"
                                : "group-hover:text-(--text-primary)"
                            )}
                          >
                            {label}
                          </span>
                          <InfoTooltip
                            label={label}
                            content={`Filter and inspect all encrypted ${label.toLowerCase()} stored in your private vault.`}
                          />
                        </div>
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <span className="text-(--text-accent)">
                            {getCategoryIcon(cat, "w-3.5 h-3.5")}
                          </span>
                          <ArrowUpRight
                            className="w-3.5 h-3.5 text-(--text-muted) opacity-75 group-hover:opacity-100 group-hover:text-(--text-accent) group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                            aria-hidden="true"
                          />
                        </span>
                      </div>

                      <div className="flex items-end justify-between gap-3 w-full">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display text-2xl sm:text-3xl text-(--text-primary) leading-none">
                              <AnimatedCounter value={count} durationMs={900} />
                            </span>
                            <span className="text-[10.5px] font-mono text-(--text-muted)">
                              {count === 1 ? "file" : "files"}
                            </span>
                          </div>
                          <span className="text-[10.5px] text-(--text-muted) block mt-1 truncate">
                            {hint}
                          </span>
                        </div>

                        <StatusPill
                          label={cat}
                          variant={getCategoryVariant(cat)}
                          size="xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Vault Command Card matching AnalyticsCommandCard */}
        <div className="xl:col-span-5 flex flex-col [&>section]:flex-1">
          <section
            aria-label="Vault Command & Upload Operations"
            className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-4 flex flex-col justify-between gap-2.5 shadow-lg h-full"
          >
            {/* Header: Non-shifting single-row toolbar matching AnalyticsCommandCard */}
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-(--border-subtle)">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/35 flex items-center justify-center text-(--text-accent) shrink-0">
                  <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono uppercase tracking-[0.14em] font-semibold text-(--text-primary) truncate">
                      Vault Command &amp; Storage
                    </span>
                    <InfoTooltip
                      label="About vault storage & encryption"
                      content="Client-authenticated binary storage with AES-256-GCM encryption. Drop files into this panel to stage them directly to cloud storage."
                      side="bottom"
                    />
                  </div>
                  <p
                    suppressHydrationWarning
                    className="text-[10px] font-mono text-(--text-muted) truncate"
                  >
                    {documents.length} files · {formatBytes(stats.totalSizeBytes)} allocated
                  </p>
                </div>
              </div>

              {/* Fixed Control Cluster matching AnalyticsCommandCard */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant={activeCategory !== "all" || searchQuery ? "secondary" : "ghost"}
                  size="sm"
                  disabled={activeCategory === "all" && !searchQuery}
                  onClick={() => {
                    setActiveCategory("all");
                    setSearchQuery("");
                  }}
                  aria-label="Reset vault filters"
                  className={cn(
                    "h-7.5 px-2.5 text-[10px] font-mono transition-opacity",
                    activeCategory !== "all" || searchQuery
                      ? "opacity-100 border-brand/40 text-(--text-accent)"
                      : "opacity-35"
                  )}
                >
                  <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" />
                  <span>Reset</span>
                </Button>

                <Tooltip content="Sync live vault contents" side="bottom">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      queryClient.invalidateQueries({
                        queryKey: queryKeys.adminVault,
                      })
                    }
                    aria-label="Refresh vault documents"
                    className="h-7.5 w-7.5"
                  >
                    <RefreshCw className="w-3 h-3 text-(--text-accent)" />
                  </Button>
                </Tooltip>
              </div>
            </div>

            {/* Center Drag & Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                handleUploadFiles(e.dataTransfer.files);
              }}
              className={cn(
                "border-2 border-dashed rounded-(--radius-card) p-4 sm:p-5 transition-all text-center flex flex-col items-center justify-center gap-2.5 my-auto",
                isDragOver
                  ? "border-brand bg-brand/5 scale-[1.01]"
                  : "border-(--border-subtle) bg-(--bg-surface-2)/40 hover:border-brand/40"
              )}
            >
              <span className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/25 flex items-center justify-center text-(--text-accent) shadow-xs">
                <UploadCloud className="w-5 h-5" />
              </span>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-(--text-primary)">
                  {isUploading
                    ? "Encrypting & Storing Documents..."
                    : "Drop Documents Here to Store"}
                </p>
                <p className="text-[10.5px] text-(--text-muted) font-mono">
                  PDF, Images, DOCX, ZIP (up to 25 MB each)
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <DropdownPopover
                  portal
                  align="center"
                  minWidth={210}
                  estimatedHeight={200}
                  trigger={({ isOpen, toggle }) => {
                    const currentCat =
                      CATEGORIES.find((c) => c.id === uploadCategory) ??
                      CATEGORIES[0];
                    return (
                      <button
                        type="button"
                        onClick={toggle}
                        aria-label="Select destination category"
                        aria-expanded={isOpen}
                        className={cn(
                          "h-8 px-2.5 rounded-(--radius-control) border text-xs font-mono inline-flex items-center gap-1.5 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand",
                          isOpen
                            ? "border-brand bg-(--bg-badge-highlight) text-(--text-primary)"
                            : "border-(--border-subtle) bg-(--bg-surface-2) text-(--text-primary) hover:border-brand/60"
                        )}
                      >
                        <span className="text-(--text-accent)">
                          {getCategoryIcon(currentCat.id, "w-3.5 h-3.5")}
                        </span>
                        <span className="font-medium text-[11px]">
                          {currentCat.label}
                        </span>
                        <ChevronDown
                          className={cn(
                            "w-3 h-3 text-(--text-muted) transition-transform duration-200",
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
                      aria-label="Select destination category"
                      className="p-1.5 space-y-0.5 bg-(--bg-surface-elevated)"
                    >
                      {CATEGORIES.map((cat) => {
                        const isSelected = cat.id === uploadCategory;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isSelected}
                            onClick={() => {
                              setUploadCategory(cat.id);
                              close();
                            }}
                            className={cn(
                              "w-full px-2.5 py-1.5 rounded-(--radius-control) text-xs font-mono flex items-center justify-between gap-2 transition-colors cursor-pointer",
                              isSelected
                                ? "bg-(--bg-badge-highlight) text-(--text-accent) font-semibold"
                                : "text-(--text-primary) hover:bg-(--bg-surface-2)"
                            )}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="text-(--text-accent)">
                                {getCategoryIcon(cat.id, "w-3.5 h-3.5")}
                              </span>
                              <span>{cat.label}</span>
                            </span>
                            {isSelected && (
                              <Check
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </DropdownPopover>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 px-3 text-xs gap-1.5 font-mono"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Browse Files</span>
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.zip,.txt"
                  onChange={(e) =>
                    e.target.files && handleUploadFiles(e.target.files)
                  }
                  className="sr-only"
                />
              </div>
            </div>

            {/* Operations & Reports Footer matching AnalyticsCommandCard */}
            <div className="pt-2.5 border-t border-(--border-subtle) flex items-center justify-between text-[10.5px] font-mono text-(--text-muted)">
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Cipher: AES-256-GCM
              </span>
              <span>Capacity: 500 MB Encrypted</span>
            </div>
          </section>
        </div>
      </div>

      {/* Row 2: Responsive Filter & Search Toolbar matching Projects & Certificates CRUD */}
      <div
        data-cascade
        className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3 sm:px-5 sm:py-3.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3"
      >
        {/* Mobile (< sm): Compact Pill Dropdown Filter */}
        <div className="sm:hidden min-w-0">
          <DropdownPopover
            portal
            align="start"
            minWidth={210}
            estimatedHeight={240}
            trigger={({ isOpen, toggle }) => {
              const activeFilter =
                filterTabs.find((t) => t.id === activeCategory) ??
                filterTabs[0];
              return (
                <button
                  type="button"
                  onClick={toggle}
                  aria-label="Filter vault documents"
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
                aria-label="Filter vault documents"
                className="p-1.5 space-y-0.5 bg-(--bg-surface-elevated)"
              >
                {filterTabs.map((tab) => {
                  const selected = tab.id === activeCategory;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        setActiveCategory(tab.id);
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

        {/* Tablet & Desktop (>= sm): Reusable Segmented Tabs */}
        <div className="hidden sm:block">
          <Tabs
            items={filterTabs}
            value={activeCategory}
            onChange={setActiveCategory}
            ariaLabel="Filter vault documents"
            size="sm"
            variant="accent"
          />
        </div>

        {/* Search, Sort & View Mode */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Search Input */}
          <div className="relative w-36 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vault..."
              className="w-full h-8.5 pl-8 pr-7 text-xs bg-(--bg-surface-2) border border-(--border-subtle) rounded-(--radius-control) text-(--text-primary) focus:border-brand focus:outline-none placeholder:text-(--text-muted) font-mono"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text-primary) cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Sort Dropdown using DropdownPopover */}
          <DropdownPopover
            portal
            align="end"
            minWidth={170}
            estimatedHeight={160}
            trigger={({ isOpen, toggle }) => {
              const currentSort =
                SORT_OPTIONS.find((s) => s.id === sortBy) ?? SORT_OPTIONS[0];
              return (
                <button
                  type="button"
                  onClick={toggle}
                  aria-label="Sort documents"
                  aria-expanded={isOpen}
                  className={cn(
                    "h-8.5 px-2.5 rounded-(--radius-control) border text-xs font-mono inline-flex items-center gap-1.5 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand",
                    isOpen
                      ? "border-brand bg-(--bg-badge-highlight) text-(--text-primary)"
                      : "border-(--border-subtle) bg-(--bg-surface-2) text-(--text-primary) hover:border-brand/60"
                  )}
                >
                  <ArrowUpDown className="w-3 h-3 text-(--text-muted)" />
                  <span className="hidden md:inline">{currentSort.label}</span>
                  <ChevronDown
                    className={cn(
                      "w-3 h-3 text-(--text-muted) transition-transform duration-200",
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
                aria-label="Sort documents"
                className="p-1.5 space-y-0.5 bg-(--bg-surface-elevated)"
              >
                {SORT_OPTIONS.map((opt) => {
                  const isSelected = opt.id === sortBy;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setSortBy(opt.id);
                        close();
                      }}
                      className={cn(
                        "w-full px-2.5 py-1.5 rounded-(--radius-control) text-xs font-mono flex items-center justify-between gap-2 transition-colors cursor-pointer",
                        isSelected
                          ? "bg-(--bg-badge-highlight) text-(--text-accent) font-semibold"
                          : "text-(--text-primary) hover:bg-(--bg-surface-2)"
                      )}
                    >
                      <span>{opt.label}</span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </DropdownPopover>

          {/* Reusable ViewToggle Component */}
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            options={VIEW_MODE_OPTIONS}
            ariaLabel="Toggle vault view mode"
            size="sm"
          />
        </div>
      </div>

      {/* Row 3: Documents View: Grid vs Table with TabPanel */}
      <TabPanel activeKey={activeCategory}>
        {filteredDocuments.length === 0 ? (
          <div
            data-cascade
            className="p-12 sm:p-16 text-center border border-dashed border-(--border-subtle) rounded-(--radius-card) bg-(--bg-surface)/40 flex flex-col items-center justify-center gap-3"
          >
            <FolderOpen
              className="w-10 h-10 sm:w-12 sm:h-12 text-(--text-muted) opacity-50"
              aria-hidden="true"
            />
            <h4 className="text-sm font-semibold uppercase tracking-wider text-(--text-primary)">
              No documents in this view
            </h4>
            <p className="text-xs text-(--text-muted) max-w-sm mx-auto">
              {searchQuery || activeCategory !== "all"
                ? "No vault files match your filter criteria."
                : "Store your TOR, diploma, certifications, and contracts safely in this vault."}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 text-xs gap-1.5 font-mono"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Upload Document</span>
            </Button>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDocuments.map((doc) => (
              <div key={doc.id} data-cascade data-vault-doc-id={doc.id}>
                <VaultDocumentCard
                  document={doc}
                  onPreview={(d) => setPreviewDoc(d)}
                  onEdit={(d) => setEditingDoc(d)}
                  onTogglePin={handleTogglePin}
                  onDelete={(d) => setDeletingDoc(d)}
                  formatBytes={formatBytes}
                />
              </div>
            ))}
          </div>
        ) : (
          /* Sleek Table List View matching CMS design system */
          <div
            data-cascade
            className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) overflow-x-auto shadow-xs"
          >
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-(--border-subtle) bg-(--bg-surface-2) text-(--text-muted) font-mono uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 font-semibold">Title & Filename</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold">Size</th>
                  <th className="py-3 px-4 font-semibold">Uploaded</th>
                  <th className="py-3 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--border-subtle)">
                {filteredDocuments.map((doc) => {
                  const docFilename =
                    doc.originalFilename ?? doc.originalFileName ?? "";
                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-(--bg-surface-2)/60 transition-colors group"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {doc.pinned && (
                            <span className="p-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                              <Pin className="w-3 h-3 text-amber-400 fill-current" />
                            </span>
                          )}
                          <div>
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(doc)}
                              className="font-semibold text-(--text-primary) hover:text-(--text-accent) text-left truncate max-w-xs block cursor-pointer transition-colors"
                            >
                              {doc.title}
                            </button>
                            <span className="text-[11px] font-mono text-(--text-muted) truncate block">
                              {docFilename}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusPill
                          label={doc.category}
                          variant={getCategoryVariant(doc.category)}
                          size="xs"
                        />
                      </td>
                      <td className="py-3 px-4 font-mono text-(--text-muted) text-[11px]">
                        {formatBytes(doc.fileSize ?? doc.fileSizeBytes ?? 0)}
                      </td>
                      <td className="py-3 px-4 font-mono text-(--text-muted) text-[11px]">
                        {new Date(doc.uploadedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <IconActionButton
                            label="Preview"
                            size="compact"
                            onClick={() => setPreviewDoc(doc)}
                            icon={<Eye className="w-3.5 h-3.5" />}
                          />
                          <IconActionButton
                            label="Edit Info"
                            size="compact"
                            onClick={() => setEditingDoc(doc)}
                            icon={<Edit2 className="w-3.5 h-3.5" />}
                          />
                          <a
                            href={`/api/admin/vault/file/${doc.id}?download=true`}
                            download={docFilename || "document"}
                            className="h-8.5 w-8.5 rounded-full inline-flex items-center justify-center bg-(--bg-surface-2) hover:bg-(--bg-badge-highlight) border border-(--border-strong) hover:border-brand text-(--text-muted) hover:text-(--text-accent) transition-all duration-200 cursor-pointer"
                            title="Download Document"
                            aria-label="Download Document"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                          <IconActionButton
                            label="Delete"
                            size="compact"
                            intent="danger"
                            onClick={() => setDeletingDoc(doc)}
                            icon={<Trash2 className="w-3.5 h-3.5" />}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TabPanel>

      {/* Viewer Modal */}
      <VaultViewerModal
        document={previewDoc}
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
      />

      {/* Edit Metadata Modal */}
      <VaultEditModal
        document={editingDoc}
        open={Boolean(editingDoc)}
        onClose={() => setEditingDoc(null)}
        onSave={async (updated) => {
          await editMutation.mutateAsync(updated);
        }}
      />

      {/* Delete Confirmation Modal */}
      {deletingDoc && (
        <ConfirmModal
          open={Boolean(deletingDoc)}
          title="Delete Document from Vault?"
          description={`Permanently delete "${deletingDoc.title}" (${
            deletingDoc.originalFilename ??
            deletingDoc.originalFileName ??
            "document"
          }) from your private vault? The binary file and metadata records will be removed.`}
          confirmLabel="Permanently Delete"
          variant="danger"
          onConfirm={async () => {
            await deleteMutation.mutateAsync(deletingDoc.id);
            setDeletingDoc(null);
          }}
          onCancel={() => setDeletingDoc(null)}
        />
      )}
    </div>
  );
}
