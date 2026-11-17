"use client";

import React, { useRef, useState } from "react";
import { Profile } from "@/types/portfolio";
import { uploadImageToAdminApi } from "@/lib/instantImageCache";
import {
  NameField,
  EmailField,
  UrlField,
  NumberField,
  MessageField,
  TextField,
  DateField,
  ImageUploadField,
  PsgcAddressFields,
  FIELD_SLOT_BUTTON_CLASS,
} from "@/components/ui/fields";
import {
  FieldSlotButton,
  IconActionButton,
  ReorderActionGroup,
} from "@/components/ui/ActionButtons";
import { ProfileLivePreviewCard } from "@/components/admin/ProfileLivePreviewCard";
import { AdminAlertBanner } from "@/components/admin/AdminAlertBanner";
import { Button } from "@/components/ui/Button";
import { Magnetic } from "@/components/motion/Magnetic";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useValidationFollower } from "@/lib/validationFollow";
import {
  sanitizeTextInput,
  PDF_FILE_ACCEPT,
  validatePdfFile,
  validateProfileDraft,
} from "@/lib/validation";
import { calculateAge } from "@/lib/date";
import {
  useOfflineStatus,
  isNetworkOffline,
} from "@/components/pwa/OfflineManager";
import {
  announceBrandPortalStatus,
  useBrandPortalWorkspaceSync,
} from "@/lib/brandPortalStatus";
import {
  Save,
  Upload,
  Plus,
  Trash2,
  Loader2,
  User,
  RotateCcw,
  Sparkles,
  AlertCircle,
} from "lucide-react";

interface ProfileHeroManagerProps {
  profile: Profile;
  onSave: (updatedProfile: Profile) => Promise<void>;
}

export function ProfileHeroManager({
  profile,
  onSave,
}: ProfileHeroManagerProps) {
  const { isOnline } = useOfflineStatus();
  const { followFirstInvalid, followNextInvalid } = useValidationFollower();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<Profile>(profile);
  const [savedBaseline, setSavedBaseline] = useState<Profile>(profile);
  const [pendingFiles, setPendingFiles] = useState<{
    monogramImageUrl: File | null;
    avatarUrl: File | null;
  }>({
    monogramImageUrl: null,
    avatarUrl: null,
  });
  const [newRole, setNewRole] = useState("");
  const [roleFeedback, setRoleFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [forceTouched, setForceTouched] = useState(false);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    variant: "primary" | "danger";
    action: () => Promise<void> | void;
  } | null>(null);

  const hasUnsavedChanges =
    JSON.stringify(draft) !== JSON.stringify(savedBaseline) ||
    Boolean(pendingFiles.monogramImageUrl || pendingFiles.avatarUrl);

  useBrandPortalWorkspaceSync({
    moduleId: "profile",
    moduleLabel: "Profile & Hero",
    hasUnsavedChanges,
    saving,
  });

  const liveErrorsCount = forceTouched
    ? validateProfileDraft({
        ...draft,
        roles: draft.roles.map((r) => r.trim()),
      }).errors.length
    : 0;

  const handleResumeUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const pdfCheck = validatePdfFile(file);
    if (!pdfCheck.valid) {
      setFormError(
        pdfCheck.error || "Only PDF (.pdf) documents are permitted for Resume/CV."
      );
      e.target.value = "";
      return;
    }

    if (isNetworkOffline(isOnline)) {
      setFormError("Offline — Reconnect to save changes.");
      e.target.value = "";
      return;
    }

    setFormError(null);
    setUploadingResume(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "resume");

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to upload resume PDF.");
      }
      if (data.url) {
        setDraft((prev) => ({ ...prev, resumeUrl: data.url }));
        announceBrandPortalStatus({
          tone: "draft",
          label: "Resume Staged",
          detail: "Save & Publish to go live",
          durationMs: 2800,
        });
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to upload resume PDF.";
      setFormError(msg);
      announceBrandPortalStatus({
        tone: "error",
        label: "Upload Failed",
        detail: msg,
      });
    } finally {
      setUploadingResume(false);
      e.target.value = "";
    }
  };

  const handleComposeFullName = () => {
    const combined = [draft.name, draft.middleName, draft.lastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");
    if (combined) {
      setDraft((prev) => ({ ...prev, fullName: combined }));
    }
  };

  const handleAddRole = () => {
    const cleaned = sanitizeTextInput(newRole, { maxLength: 60 }).trim();
    if (cleaned.length < 2) {
      setRoleFeedback("Role title must be at least 2 characters.");
      return;
    }
    const isDuplicate = draft.roles.some(
      (existing) => existing.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (isDuplicate) {
      setRoleFeedback(`"${cleaned}" is already in your Hero role stack.`);
      return;
    }
    setRoleFeedback(null);
    setDraft((prev) => ({
      ...prev,
      roles: [...prev.roles, cleaned],
    }));
    setNewRole("");
  };

  const handleUpdateRole = (index: number, nextValue: string) => {
    setRoleFeedback(null);
    setDraft((prev) => {
      const next = [...prev.roles];
      next[index] = nextValue;
      return { ...prev, roles: next };
    });
  };

  const handleMoveRole = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= draft.roles.length) return;
    setDraft((prev) => {
      const next = [...prev.roles];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return { ...prev, roles: next };
    });
  };

  const handleRemoveRole = (index: number) => {
    if (draft.roles.length <= 1) {
      setRoleFeedback("At least one Hero Role Title must remain active.");
      return;
    }
    const roleLabel = draft.roles[index] || `Role #${index + 1}`;
    setConfirmState({
      title: `Remove "${roleLabel}"?`,
      description:
        "This removes the role title from your Hero top-left stack in the draft.",
      confirmLabel: "Remove Role",
      variant: "danger",
      action: () => {
        setRoleFeedback(null);
        setDraft((prev) => ({
          ...prev,
          roles: prev.roles.filter((_, i) => i !== index),
        }));
      },
    });
  };

  const handleDiscardDraft = () => {
    setConfirmState({
      title: "Discard Unsaved Changes?",
      description:
        "All unsubmitted edits in the Profile, Hero & Identity tab will revert to your last published snapshot.",
      confirmLabel: "Discard Changes",
      variant: "danger",
      action: () => {
        setDraft(savedBaseline);
        setPendingFiles({ monogramImageUrl: null, avatarUrl: null });
        setForceTouched(false);
        setFormError(null);
        setRoleFeedback(null);
        setNewRole("");
        announceBrandPortalStatus({
          tone: "synced",
          label: "Draft Discarded",
          detail: "Reverted to published profile",
          durationMs: 2600,
        });
      },
    });
  };

  const executeSave = async (candidateProfile: Profile) => {
    if (isNetworkOffline(isOnline)) {
      const msg = "Offline — Reconnect to publish changes.";
      setFormError(msg);
      announceBrandPortalStatus({
        tone: "offline",
        label: "Offline Mode",
        detail: "Reconnect to publish changes",
      });
      setConfirmState(null);
      return;
    }

    setSaving(true);
    setFormError(null);
    announceBrandPortalStatus({
      tone: "saving",
      label: "Publishing...",
      detail: "Syncing Profile & Hero live",
      durationMs: 0,
    });
    try {
      let finalProfile = { ...candidateProfile };

      if (pendingFiles.monogramImageUrl) {
        const uploadedUrl = await uploadImageToAdminApi(
          pendingFiles.monogramImageUrl,
          "monogram"
        );
        finalProfile = { ...finalProfile, monogramImageUrl: uploadedUrl };
      }

      if (pendingFiles.avatarUrl) {
        const uploadedUrl = await uploadImageToAdminApi(
          pendingFiles.avatarUrl,
          "hero"
        );
        finalProfile = { ...finalProfile, avatarUrl: uploadedUrl };
      }

      await onSave(finalProfile);
      setPendingFiles({ monogramImageUrl: null, avatarUrl: null });
      setDraft(finalProfile);
      setSavedBaseline(finalProfile);
      setForceTouched(false);
      setConfirmState(null);
      announceBrandPortalStatus({
        tone: "live",
        label: "Saved & Live!",
        detail: "Profile, Hero & Favicon published",
        durationMs: 3600,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save portfolio changes.";
      setFormError(msg);
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
    setForceTouched(true);
    setValidationAttempt((c) => c + 1);
    setFormError(null);
    setRoleFeedback(null);

    const syncedAge = calculateAge(draft.birthDate);
    const candidateProfile: Profile = {
      ...draft,
      age: syncedAge ?? draft.age,
      roles: draft.roles.map((r) => r.trim()),
    };

    const validation = validateProfileDraft(candidateProfile);

    if (!validation.valid) {
      const extraCount =
        validation.errors.length > 1
          ? ` (+${validation.errors.length - 1} more field${
              validation.errors.length > 2 ? "s" : ""
            } require attention)`
          : "";
      setFormError(`${validation.errors[0]}${extraCount}`);
      announceBrandPortalStatus({
        tone: "error",
        label: "Check Required Fields",
        detail: validation.errors[0],
      });
      followFirstInvalid(formRef.current);
      return;
    }

    setConfirmState({
      title: "Save & Publish Profile Changes?",
      description: `This will immediately publish updates to your public Hero, computed Age (${candidateProfile.age}), PSGC Location (${candidateProfile.contact.location}), and browser tab favicon.`,
      confirmLabel: "Save & Publish",
      variant: "primary",
      action: () => executeSave(candidateProfile),
    });
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-8">
      {/* Header & Sticky Save Bar */}
      <div
        data-sticky-ceiling="true"
        className="bg-[#111114] border border-white/10 rounded-sm p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4 sticky top-16 z-20 shadow-xl"
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <User className="w-5 h-5 text-(--text-accent) shrink-0 mt-0.5 sm:mt-0" />
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl uppercase tracking-tight text-[#f3f1ea]">
              Profile, Hero & Identity Manager
            </h2>
            <p className="text-xs text-[#807f78]">
              Manage identity typography, monogram & browser tab favicon, portrait cutout, roles, birth date, education, and PSGC location.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {forceTouched && liveErrorsCount > 0 && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => followNextInvalid(formRef.current)}
              title="Jump smoothly to the next field requiring attention"
              className="h-10 px-4 font-mono"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>
                {liveErrorsCount} Issue{liveErrorsCount === 1 ? "" : "s"} · Follow
              </span>
            </Button>
          )}

          {hasUnsavedChanges && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDiscardDraft}
              disabled={saving}
              className="h-10 px-4 font-mono"
            >
              <RotateCcw className="w-3.5 h-3.5 text-(--text-muted)" />
              <span>Discard</span>
            </Button>
          )}

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={saving}
            className="h-10 px-6 text-xs tracking-[0.16em]"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Save &amp; Publish</span>
          </Button>
        </div>
      </div>

      {formError && (
        <AdminAlertBanner
          variant="error"
          message={formError}
          actionLabel={forceTouched ? "Follow Issue" : undefined}
          onAction={
            forceTouched ? () => followNextInvalid(formRef.current) : undefined
          }
          onDismiss={() => setFormError(null)}
        />
      )}

      {/* Live Preview Strip */}
      <ProfileLivePreviewCard draft={draft} publishedProfile={savedBaseline} />

      {/* 1. Identity & Giant Hero Name */}
      <div className="bg-[#111114] border border-white/10 rounded-(--radius-card) p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <h3 className="font-display text-xl uppercase tracking-tight text-[#f3f1ea]">
            1. Identity & Hero Display Typography
          </h3>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleComposeFullName}
            className="h-8 px-3 font-mono text-[11px] text-(--text-accent)"
          >
            <Sparkles className="w-3 h-3" />
            <span>Auto-compose Full Legal Name</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
          <NameField
            label="First / Given Name"
            value={draft.name}
            onChange={(name) => setDraft({ ...draft, name })}
            maxLength={40}
            showIcon={false}
            forceTouched={forceTouched}
          />

          <NameField
            label="Middle Name"
            value={draft.middleName || ""}
            onChange={(middleName) => setDraft({ ...draft, middleName })}
            required={false}
            minLength={1}
            maxLength={40}
            showIcon={false}
            forceTouched={forceTouched}
          />

          <NameField
            label="Surname (Red Hero)"
            value={draft.lastName || "Valdellon"}
            onChange={(lastName) => setDraft({ ...draft, lastName })}
            maxLength={40}
            showIcon={false}
            forceTouched={forceTouched}
          />

          <NameField
            label="Full Legal Name"
            value={draft.fullName}
            onChange={(fullName) => setDraft({ ...draft, fullName })}
            minLength={4}
            maxLength={80}
            showIcon={false}
            forceTouched={forceTouched}
          />

          <TextField
            label="Monogram Fallback"
            value={draft.monogram}
            onChange={(monogram) => setDraft({ ...draft, monogram })}
            minLength={2}
            maxLength={5}
            uppercase
            mono
            showCounter
            forceTouched={forceTouched}
            hint="Shown when no monogram image is set."
          />

          <DateField
            label="Birth Date"
            value={draft.birthDate || ""}
            onChange={(birthDate) => {
              const nextAge = calculateAge(birthDate);
              setDraft({
                ...draft,
                birthDate,
                age: nextAge ?? draft.age,
              });
            }}
            minAge={15}
            maxAge={100}
            forceTouched={forceTouched}
            hint="Automatically computes Age on your public portfolio."
          />
        </div>

        <TextField
          label="Primary Headline"
          value={draft.headline}
          onChange={(headline) => setDraft({ ...draft, headline })}
          minLength={4}
          maxLength={120}
          showCounter
          forceTouched={forceTouched}
        />

        <MessageField
          label="Hero Bio Pitch"
          rows={3}
          minLength={20}
          maxLength={420}
          value={draft.bio}
          onChange={(bio) => setDraft({ ...draft, bio })}
          forceTouched={forceTouched}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-start">
          <TextField
            label="Primary CTA Text"
            value={draft.heroCtaPrimary || "View Systems"}
            onChange={(heroCtaPrimary) =>
              setDraft({ ...draft, heroCtaPrimary })
            }
            minLength={2}
            maxLength={32}
            showCounter
            forceTouched={forceTouched}
          />

          <TextField
            label="Secondary CTA Text"
            value={draft.heroCtaSecondary || "Contact Me"}
            onChange={(heroCtaSecondary) =>
              setDraft({ ...draft, heroCtaSecondary })
            }
            minLength={2}
            maxLength={32}
            showCounter
            forceTouched={forceTouched}
          />

          <TextField
            label="Scroll Cue Label"
            value={draft.heroScrollCue || "Scroll to enter the story"}
            onChange={(heroScrollCue) => setDraft({ ...draft, heroScrollCue })}
            minLength={3}
            maxLength={60}
            showCounter
            forceTouched={forceTouched}
          />
        </div>
      </div>

      {/* 2. Brand Assets: Monogram/Favicon, Hero Cutout & Resume PDF */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#111114] border border-white/10 rounded-(--radius-card) p-5 sm:p-6 space-y-4 min-w-0">
          <h3 className="font-display text-xl uppercase tracking-tight text-[#f3f1ea] border-b border-white/10 pb-3">
            2. Monogram Logo & Browser Favicon
          </h3>
          <ImageUploadField
            label="Monogram Logo Image (Updates Favicon)"
            value={draft.monogramImageUrl || ""}
            transform={draft.monogramTransform}
            pendingFile={pendingFiles.monogramImageUrl}
            onChange={(monogramImageUrl) =>
              setDraft((prev) => ({ ...prev, monogramImageUrl }))
            }
            onTransformChange={(monogramTransform) => {
              setDraft((prev) => ({ ...prev, monogramTransform }));
              announceBrandPortalStatus({
                tone: "draft",
                label: "Draft Updated",
                detail: "Monogram framing staged in placeholder",
                durationMs: 2600,
              });
            }}
            onPendingFileChange={(file) =>
              setPendingFiles((prev) => ({ ...prev, monogramImageUrl: file }))
            }
            onRevertToSaved={() => {
              setPendingFiles((prev) => ({ ...prev, monogramImageUrl: null }));
              setDraft((prev) => ({
                ...prev,
                monogramImageUrl: savedBaseline.monogramImageUrl,
                monogramTransform: savedBaseline.monogramTransform,
              }));
              announceBrandPortalStatus({
                tone: "synced",
                label: "Reverted Placeholder",
                detail: "Restored published monogram",
                durationMs: 2400,
              });
            }}
            isDraftModified={
              Boolean(pendingFiles.monogramImageUrl) ||
              (draft.monogramImageUrl || "") !==
                (savedBaseline.monogramImageUrl || "") ||
              JSON.stringify(draft.monogramTransform ?? null) !==
                JSON.stringify(savedBaseline.monogramTransform ?? null)
            }
            folder="monogram"
            placeholder="/uploads/monogram/logo.png or https://..."
            required={false}
            previewShape="circle"
            previewSize="lg"
            previewFit="cover"
            previewAlt="Monogram & browser favicon placeholder"
            forceTouched={forceTouched}
            onUploadError={(msg) => {
              setFormError(msg);
              announceBrandPortalStatus({
                tone: "error",
                label: "Image Rejected",
                detail: msg,
              });
            }}
            hint="Strict images only (.png, .jpg, .webp, .avif, .svg, .ico · max 5MB). Resize/framing updates placeholder only until you click Save & Publish."
          />
        </div>

        <div className="bg-[#111114] border border-white/10 rounded-(--radius-card) p-5 sm:p-6 space-y-4 min-w-0">
          <h3 className="font-display text-xl uppercase tracking-tight text-[#f3f1ea] border-b border-white/10 pb-3">
            3. Hero Portrait Cutout (Avatar)
          </h3>
          <ImageUploadField
            label="Portrait Image Path or URL"
            value={draft.avatarUrl || "/assets/hero/avatar.png"}
            transform={draft.avatarTransform}
            pendingFile={pendingFiles.avatarUrl}
            onChange={(avatarUrl) =>
              setDraft((prev) => ({ ...prev, avatarUrl }))
            }
            onTransformChange={(avatarTransform) => {
              setDraft((prev) => ({ ...prev, avatarTransform }));
              announceBrandPortalStatus({
                tone: "draft",
                label: "Draft Updated",
                detail: "Portrait framing staged in placeholder",
                durationMs: 2600,
              });
            }}
            onPendingFileChange={(file) =>
              setPendingFiles((prev) => ({ ...prev, avatarUrl: file }))
            }
            onRevertToSaved={() => {
              setPendingFiles((prev) => ({ ...prev, avatarUrl: null }));
              setDraft((prev) => ({
                ...prev,
                avatarUrl: savedBaseline.avatarUrl,
                avatarTransform: savedBaseline.avatarTransform,
              }));
              announceBrandPortalStatus({
                tone: "synced",
                label: "Reverted Placeholder",
                detail: "Restored published portrait",
                durationMs: 2400,
              });
            }}
            isDraftModified={
              Boolean(pendingFiles.avatarUrl) ||
              draft.avatarUrl !== savedBaseline.avatarUrl ||
              JSON.stringify(draft.avatarTransform ?? null) !==
                JSON.stringify(savedBaseline.avatarTransform ?? null)
            }
            folder="hero"
            placeholder="/assets/hero/avatar.png"
            required
            previewShape="squircle"
            previewSize="lg"
            previewFit="contain"
            previewAlt="Hero portrait preview placeholder"
            forceTouched={forceTouched}
            onUploadError={(msg) => {
              setFormError(msg);
              announceBrandPortalStatus({
                tone: "error",
                label: "Image Rejected",
                detail: msg,
              });
            }}
            hint="Strict images only (.png, .jpg, .webp, .avif, .svg, .ico · max 5MB). Resize/framing updates placeholder only until you click Save & Publish."
          />
        </div>
      </div>

      {/* Resume / CV Card */}
      <div className="bg-[#111114] border border-white/10 rounded-(--radius-card) p-5 sm:p-6 space-y-4 min-w-0">
        <h3 className="font-display text-xl uppercase tracking-tight text-[#f3f1ea] border-b border-white/10 pb-3">
          4. Resume / CV Download Document
        </h3>
        <UrlField
          label="Resume PDF Path or Drive Link"
          placeholder="/uploads/resume/lou-cv.pdf or https://..."
          value={draft.resumeUrl || ""}
          onChange={(resumeUrl) => setDraft({ ...draft, resumeUrl })}
          required={false}
          allowRelativePath
          forceTouched={forceTouched}
          hint="Shows a 'Resume' download button in the Hero section when set (.pdf max 10MB)."
          rightSlot={
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <Magnetic strength={0.18}>
                <label className={FIELD_SLOT_BUTTON_CLASS}>
                  {uploadingResume ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-(--text-accent)" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 text-(--text-accent)" />
                  )}
                  <span>{uploadingResume ? "Uploading..." : "Upload PDF"}</span>
                  <input
                    type="file"
                    accept={PDF_FILE_ACCEPT}
                    disabled={uploadingResume}
                    onChange={handleResumeUpload}
                    className="hidden"
                  />
                </label>
              </Magnetic>

              {draft.resumeUrl && (
                <IconActionButton
                  label="Remove Resume link"
                  intent="danger"
                  size="square"
                  icon={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                  onClick={() =>
                    setConfirmState({
                      title: "Remove Resume / CV Link?",
                      description:
                        "This removes the attached Resume PDF path from your draft and hides the Resume button in the Hero section once saved.",
                      confirmLabel: "Remove Resume",
                      variant: "danger",
                      action: () => setDraft({ ...draft, resumeUrl: "" }),
                    })
                  }
                />
              )}
            </div>
          }
        />
      </div>

      {/* 5. Stacked Hero Roles (All Reusable TextField Components & Aligned Slots) */}
      <div className="bg-[#111114] border border-white/10 rounded-sm p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="font-display text-xl uppercase tracking-tight text-[#f3f1ea]">
            5. Hero Role Titles (Top-Left Stack)
          </h3>
          <span className="text-[11px] font-mono text-(--text-muted)">
            {draft.roles.length} active role{draft.roles.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {draft.roles.map((role, idx) => (
            <TextField
              key={idx}
              label={`Role Title ${String(idx + 1).padStart(2, "0")}`}
              value={role}
              onChange={(nextVal) => handleUpdateRole(idx, nextVal)}
              minLength={2}
              maxLength={60}
              forceTouched={forceTouched}
              leftSlot={
                <span className="text-xs font-mono text-(--text-accent)">
                  {String(idx + 1).padStart(2, "0")}
                </span>
              }
              rightSlot={
                <ReorderActionGroup
                  index={idx}
                  total={draft.roles.length}
                  itemLabel={`role ${idx + 1}`}
                  canRemove={draft.roles.length > 1}
                  onMoveUp={() => handleMoveRole(idx, "up")}
                  onMoveDown={() => handleMoveRole(idx, "down")}
                  onRemove={() => handleRemoveRole(idx)}
                />
              }
            />
          ))}
        </div>

        <div className="max-w-lg pt-2">
          <TextField
            label="Add New Role Title"
            value={newRole}
            onChange={(val) => {
              setRoleFeedback(null);
              setNewRole(val);
            }}
            placeholder="e.g. Cloud Systems Engineer"
            required={false}
            minLength={2}
            maxLength={60}
            showCounter
            rightSlot={
              <FieldSlotButton onClick={handleAddRole}>
                <Plus className="w-3.5 h-3.5 text-(--text-accent)" aria-hidden="true" />
                <span>Add Role</span>
              </FieldSlotButton>
            }
          />
          {roleFeedback && (
            <p className="text-[11px] font-mono text-(--text-accent) mt-1.5">
              {roleFeedback}
            </p>
          )}
        </div>
      </div>

      {/* 6. Education & Contact Info (with Cascading PSGC Fields) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-[#111114] border border-white/10 rounded-sm p-6 space-y-5">
          <h3 className="font-display text-xl uppercase tracking-tight text-[#f3f1ea] border-b border-white/10 pb-3">
            6. Education Credentials
          </h3>
          <div className="space-y-4">
            <TextField
              label="Degree Program"
              value={draft.education.degree}
              onChange={(degree) =>
                setDraft({
                  ...draft,
                  education: { ...draft.education, degree },
                })
              }
              minLength={3}
              maxLength={100}
              forceTouched={forceTouched}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <TextField
                label="Specialization / Major"
                value={draft.education.major}
                onChange={(major) =>
                  setDraft({
                    ...draft,
                    education: { ...draft.education, major },
                  })
                }
                minLength={2}
                maxLength={80}
                forceTouched={forceTouched}
              />

              <NumberField
                label="Graduation Year"
                value={draft.education.graduationYear}
                onChange={(graduationYear) =>
                  setDraft({
                    ...draft,
                    education: { ...draft.education, graduationYear },
                  })
                }
                min={2000}
                max={2035}
                forceTouched={forceTouched}
              />
            </div>

            <TextField
              label="Academic Status Label"
              value={draft.education.status}
              onChange={(status) =>
                setDraft({
                  ...draft,
                  education: { ...draft.education, status },
                })
              }
              minLength={3}
              maxLength={80}
              forceTouched={forceTouched}
            />
          </div>
        </div>

        <div className="bg-[#111114] border border-white/10 rounded-sm p-6 space-y-5">
          <h3 className="font-display text-xl uppercase tracking-tight text-[#f3f1ea] border-b border-white/10 pb-3">
            7. Contact, Social Links & PSGC Address
          </h3>
          <div className="space-y-4">
            <EmailField
              label="Direct Email Address"
              value={draft.contact.email}
              onChange={(email) =>
                setDraft({
                  ...draft,
                  contact: { ...draft.contact, email },
                })
              }
              forceTouched={forceTouched}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <UrlField
                label="GitHub Profile URL"
                value={draft.contact.github}
                onChange={(github) =>
                  setDraft({
                    ...draft,
                    contact: { ...draft.contact, github },
                  })
                }
                allowRelativePath={false}
                required
                forceTouched={forceTouched}
              />

              <UrlField
                label="LinkedIn Profile URL"
                value={draft.contact.linkedin}
                onChange={(linkedin) =>
                  setDraft({
                    ...draft,
                    contact: { ...draft.contact, linkedin },
                  })
                }
                allowRelativePath={false}
                required
                forceTouched={forceTouched}
              />
            </div>

            <div className="pt-2 border-t border-white/10">
              <PsgcAddressFields
                address={draft.contact.address}
                formattedLocation={draft.contact.location}
                forceTouched={forceTouched}
                validationAttempt={validationAttempt}
                onChange={(nextAddress, nextFormattedLocation) =>
                  setDraft({
                    ...draft,
                    contact: {
                      ...draft.contact,
                      address: nextAddress,
                      location: nextFormattedLocation || "Philippines",
                    },
                  })
                }
              />
            </div>

            <TextField
              label="Availability Status Badge"
              value={draft.contact.status}
              onChange={(status) =>
                setDraft({
                  ...draft,
                  contact: { ...draft.contact, status },
                })
              }
              minLength={3}
              maxLength={80}
              forceTouched={forceTouched}
            />
          </div>
        </div>
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
          if (confirmState.variant === "danger") {
            await act();
            setConfirmState(null);
          } else {
            await act();
          }
        }}
      />
    </form>
  );
}
