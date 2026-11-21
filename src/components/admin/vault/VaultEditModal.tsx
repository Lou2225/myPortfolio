"use client";

import React, { useState } from "react";
import { VaultCategory, VaultDocument } from "@/types/vault";
import { ModalShell } from "@/components/ui/ModalShell";
import { Button } from "@/components/ui/Button";
import {
  FieldWrapper,
  MessageField,
  SubjectField,
} from "@/components/ui/fields";
import { getCategoryIcon } from "@/components/admin/vault/VaultDocumentCard";
import { sanitizeTextInput } from "@/lib/validation";
import { Check, Edit2, Pin, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VaultEditModalProps {
  document: VaultDocument | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: {
    id: string;
    title: string;
    category: VaultCategory;
    tags: string[];
    notes?: string;
    pinned: boolean;
  }) => Promise<void>;
}

const VAULT_CATEGORIES: { id: VaultCategory; label: string; shortLabel: string }[] = [
  { id: "academic", label: "Academic Records", shortLabel: "Academic" },
  { id: "government", label: "Government IDs & Clearances", shortLabel: "Government" },
  { id: "career", label: "Career & Employment Contracts", shortLabel: "Career" },
  { id: "legal", label: "Legal & Financial Documents", shortLabel: "Legal" },
  { id: "personal", label: "Personal & Miscellaneous", shortLabel: "Personal" },
];

export function VaultEditModal({
  document,
  open,
  onClose,
  onSave,
}: VaultEditModalProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<VaultCategory>("personal");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState("");
  const [pinned, setPinned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);
  const [prevDocId, setPrevDocId] = useState<string | null>(null);

  if (open && (!prevOpen || (document?.id ?? null) !== prevDocId)) {
    setPrevOpen(true);
    setPrevDocId(document?.id ?? null);
    if (document) {
      setTitle(document.title || "");
      setCategory(document.category || "personal");
      setTags(document.tags ? [...document.tags] : []);
      setNotes(document.notes || "");
      setPinned(Boolean(document.pinned));
      setErrorMsg(null);
    }
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  if (!document) return null;

  const handleAddTag = () => {
    const cleaned = sanitizeTextInput(tagInput, { maxLength: 30 }).trim();
    if (!cleaned) return;
    if (!tags.includes(cleaned)) {
      setTags((prev) => [...prev, cleaned]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setErrorMsg("Document title is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSave({
        id: document.id,
        title: cleanTitle,
        category,
        tags,
        notes: notes.trim() || undefined,
        pinned,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save metadata.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-xl"
      ariaLabelledBy="vault-edit-title"
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col max-h-[85vh] bg-(--bg-surface) rounded-(--radius-card) border border-(--border-subtle) shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-(--border-subtle) bg-(--bg-surface-2) shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-brand/15 border border-brand/35 flex items-center justify-center text-(--text-accent)">
              <Edit2 className="w-4 h-4" />
            </span>
            <h3
              id="vault-edit-title"
              className="font-display text-base uppercase tracking-wider text-(--text-primary)"
            >
              Edit Document Info
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-surface) transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 text-xs rounded-(--radius-control) bg-rose-500/12 text-rose-400 border border-rose-500/30">
              {errorMsg}
            </div>
          )}

          <SubjectField
            label="Document Title"
            value={title}
            onChange={setTitle}
            required
            maxLength={120}
          />

          {/* Category Pill Radio Selector matching CertificateDetailEditor */}
          <FieldWrapper id="vault-edit-category" label="Category Folder" required>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {VAULT_CATEGORIES.map((cat) => {
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={cn(
                      "p-2.5 rounded-(--radius-control) border text-left transition-all cursor-pointer font-mono select-none",
                      isSelected
                        ? "border-brand bg-(--bg-badge-highlight) text-(--text-primary) ring-1 ring-brand/50 shadow-xs"
                        : "border-(--border-subtle) bg-(--bg-surface-2) text-(--text-secondary) hover:border-(--border-strong) hover:text-(--text-primary)"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={isSelected ? "text-(--text-accent)" : "text-(--text-muted)"}>
                        {getCategoryIcon(cat.id, "w-3.5 h-3.5")}
                      </span>
                      <span className="text-xs font-semibold block truncate">
                        {cat.shortLabel}
                      </span>
                    </div>
                    <span className="text-[10px] text-(--text-muted) block truncate">
                      {cat.id}
                    </span>
                  </button>
                );
              })}
            </div>
          </FieldWrapper>

          <FieldWrapper
            id="vault-edit-tags"
            label="Tags"
            hint="Press Enter or click Add to tag"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="e.g. valid-until-2028, primary-id"
                  className="flex-1 h-9 px-3 text-xs bg-(--bg-surface-2) border border-(--border-subtle) rounded-(--radius-control) text-(--text-primary) focus:border-brand focus:outline-none"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddTag}
                  className="h-9 px-3 text-xs gap-1 font-mono"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </Button>
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded bg-(--bg-surface-2) border border-(--border-subtle) text-(--text-secondary) font-mono"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-rose-400 cursor-pointer"
                        aria-label={`Remove tag ${tag}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </FieldWrapper>

          <MessageField
            label="Notes / Annotation"
            value={notes}
            onChange={setNotes}
            rows={3}
            maxLength={500}
            placeholder="e.g. Scanned official copy from University Registrar..."
          />

          <label className="flex items-center gap-3 p-3.5 rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface-2) cursor-pointer select-none transition-colors hover:border-(--border-strong)">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="w-4 h-4 accent-brand rounded cursor-pointer"
            />
            <div>
              <span className="text-xs font-semibold text-(--text-primary) flex items-center gap-1.5">
                <Pin className="w-3.5 h-3.5 text-brand" />
                Pin to Top of Vault
              </span>
              <span className="text-[11px] text-(--text-muted)">
                Always show this file at the top of document lists
              </span>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-(--border-subtle) bg-(--bg-surface-2) shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs px-4 font-mono"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isSubmitting}
            className="text-xs px-5 gap-1.5 font-mono"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSubmitting ? "Saving..." : "Save Changes"}</span>
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}
