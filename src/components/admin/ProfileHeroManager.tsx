"use client";

import React, { useMemo, useRef, useState } from "react";
import { Profile } from "@/types/portfolio";
import { uploadImageToAdminApi } from "@/lib/instantImageCache";
import { moveArrayItem } from "@/lib/utils";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  AdminMobileStepView,
  MobileStepItem,
  useStepNavigation,
} from "@/components/admin/AdminMobileStepView";
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
} from "@/components/ui/ActionButtons";
import { HeroRoleRow } from "@/components/admin/HeroRoleRow";
import { AdminModuleHeaderBar } from "@/components/admin/AdminModuleHeaderBar";
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
  Upload,
  Plus,
  Trash2,
  Loader2,
  User,
  Sparkles,
  Save,
} from "lucide-react";

type ProfileStep = 0 | 1 | 2 | 3;

const PROFILE_STEPS: readonly {
  step: ProfileStep;
  code: string;
  shortTitle: string;
}[] = [
  { step: 0, code: "01", shortTitle: "Hero" },
  { step: 1, code: "02", shortTitle: "Assets" },
  { step: 2, code: "03", shortTitle: "Edu" },
  { step: 3, code: "04", shortTitle: "Contact" },
];

function classifyProfileErrorStep(errorMessage: string): ProfileStep {
  const lower = errorMessage.toLowerCase();
  if (
    lower.includes("monogram / favicon") ||
    lower.includes("portrait image") ||
    lower.includes("resume pdf")
  ) {
    return 1;
  }
  if (
    lower.includes("degree program") ||
    lower.includes("specialization / major") ||
    lower.includes("graduation year") ||
    lower.includes("academic status")
  ) {
    return 2;
  }
  if (
    lower.includes("direct email") ||
    lower.includes("github profile") ||
    lower.includes("linkedin profile") ||
    lower.includes("psgc") ||
    lower.includes("city / municipality") ||
    lower.includes("location") ||
    lower.includes("availability status")
  ) {
    return 3;
  }
  return 0;
}

interface ProfileHeroManagerProps {
  profile: Profile;
  onSave: (updatedProfile: Profile) => Promise<void>;
}

export function ProfileHeroManager({
  profile,
  onSave,
}: ProfileHeroManagerProps) {
  const { isOnline } = useOfflineStatus();
  const isMobileOrTablet = useMediaQuery("(max-width: 1023px)");
  const { activeStep, stepDirection, switchStep } =
    useStepNavigation<ProfileStep>(0);
  const { followFirstInvalid, followNextInvalid } = useValidationFollower();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<Profile>(profile);
  const [savedBaseline, setSavedBaseline] = useState<Profile>(profile);
  const [roleIds, setRoleIds] = useState<string[]>(() =>
    profile.roles.map((_, i) => `role-init-${i}`)
  );
  const nextRoleKeyRef = useRef(profile.roles.length);
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

  const liveValidation = useMemo(
    () =>
      validateProfileDraft({
        ...draft,
        roles: draft.roles.map((r) => r.trim()),
      }),
    [draft]
  );

  const liveErrorsCount = forceTouched ? liveValidation.errors.length : 0;

  const stepHasError: Record<ProfileStep, boolean> = {
    0: false,
    1: false,
    2: false,
    3: false,
  };
  if (forceTouched && liveValidation.errors.length > 0) {
    for (const err of liveValidation.errors) {
      stepHasError[classifyProfileErrorStep(err)] = true;
    }
  }
  const firstErrorStep: ProfileStep | null =
    liveValidation.errors.length > 0
      ? classifyProfileErrorStep(liveValidation.errors[0])
      : null;

  const mobileSteps: MobileStepItem[] = PROFILE_STEPS.map((item) => ({
    code: item.code,
    shortTitle: item.shortTitle,
    hasError: stepHasError[item.step],
  }));

  const jumpToValidationIssue = (
    mode: "first" | "next",
    explicitErrors?: string[]
  ) => {
    const errs = explicitErrors ?? liveValidation.errors;
    const target =
      errs.length > 0 ? classifyProfileErrorStep(errs[0]) : firstErrorStep;
    if (
      isMobileOrTablet &&
      target !== null &&
      (mode === "first" || !stepHasError[activeStep])
    ) {
      switchStep(target);
    }
    window.requestAnimationFrame(() =>
      mode === "first"
        ? followFirstInvalid(formRef.current)
        : followNextInvalid(formRef.current)
    );
  };

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
    const nextId = `role-${nextRoleKeyRef.current++}`;
    setDraft((prev) => ({
      ...prev,
      roles: [...prev.roles, cleaned],
    }));
    setRoleIds((prev) => [...prev, nextId]);
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
    setDraft((prev) => ({
      ...prev,
      roles: moveArrayItem(prev.roles, index, target),
    }));
    setRoleIds((prev) => moveArrayItem(prev, index, target));
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
        setRoleIds((prev) => prev.filter((_, i) => i !== index));
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
        setRoleIds(
          savedBaseline.roles.map(
            () => `role-reset-${nextRoleKeyRef.current++}`
          )
        );
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
          ? ` (+${validation.errors.length - 1} more field${validation.errors.length > 2 ? "s" : ""
          } require attention)`
          : "";
      setFormError(`${validation.errors[0]}${extraCount}`);
      announceBrandPortalStatus({
        tone: "error",
        label: "Check Required Fields",
        detail: validation.errors[0],
      });
      jumpToValidationIssue("first", validation.errors);
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

  const identitySectionNode = (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 border-b border-(--border-subtle) pb-3">
          <h3 className="font-display text-lg sm:text-xl uppercase tracking-tight text-(--text-primary)">
            1. Identity &amp; Hero Display Typography
          </h3>

          <div className="w-full sm:w-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              fullWidth
              onClick={handleComposeFullName}
              className="h-9 sm:h-8 px-3 font-mono text-[11px] text-(--text-accent) bg-(--bg-badge-highlight)/70 sm:bg-transparent border border-brand/25 sm:border-transparent hover:border-brand/45 sm:hover:border-transparent"
            >
              <Sparkles className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>Auto-compose Full Legal Name</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 items-start">
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

        <div className="pt-3.5 sm:pt-4 border-t border-(--border-subtle)/60 space-y-4 sm:space-y-5">
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
            expandableOnMobile
            value={draft.bio}
            onChange={(bio) => setDraft({ ...draft, bio })}
            forceTouched={forceTouched}
          />
        </div>

        <div className="pt-3.5 sm:pt-4 border-t border-(--border-subtle)/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 items-start">
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
            className="sm:col-span-2 lg:col-span-1"
          />
        </div>
      </div>
  );

  const assetsMediaGridNode = (() => {
        const buildImageFieldBindings = ({
          urlKey,
          transformKey,
          noun,
          fallbackUrl = "",
        }: {
          urlKey: "monogramImageUrl" | "avatarUrl";
          transformKey: "monogramTransform" | "avatarTransform";
          noun: string;
          fallbackUrl?: string;
        }) => ({
          value: draft[urlKey] || fallbackUrl,
          transform: draft[transformKey],
          pendingFile: pendingFiles[urlKey],
          onChange: (nextUrl: string) =>
            setDraft((prev) => ({ ...prev, [urlKey]: nextUrl })),
          onTransformChange: (nextTransform: Profile[typeof transformKey]) => {
            setDraft((prev) => ({ ...prev, [transformKey]: nextTransform }));
            announceBrandPortalStatus({
              tone: "draft",
              label: "Draft Updated",
              detail: `${noun} framing staged in placeholder`,
              durationMs: 2600,
            });
          },
          onPendingFileChange: (file: File | null) =>
            setPendingFiles((prev) => ({ ...prev, [urlKey]: file })),
          onRevertToSaved: () => {
            setPendingFiles((prev) => ({ ...prev, [urlKey]: null }));
            setDraft((prev) => ({
              ...prev,
              [urlKey]: savedBaseline[urlKey],
              [transformKey]: savedBaseline[transformKey],
            }));
            announceBrandPortalStatus({
              tone: "synced",
              label: "Reverted Placeholder",
              detail: `Restored published ${noun.toLowerCase()}`,
              durationMs: 2400,
            });
          },
          isDraftModified:
            Boolean(pendingFiles[urlKey]) ||
            (draft[urlKey] || "") !== (savedBaseline[urlKey] || "") ||
            JSON.stringify(draft[transformKey] ?? null) !==
              JSON.stringify(savedBaseline[transformKey] ?? null),
          onUploadError: (msg: string) => {
            setFormError(msg);
            announceBrandPortalStatus({
              tone: "error",
              label: "Image Rejected",
              detail: msg,
            });
          },
        });

        const monogramBindings = buildImageFieldBindings({
          urlKey: "monogramImageUrl",
          transformKey: "monogramTransform",
          noun: "Monogram",
        });

        const avatarBindings = buildImageFieldBindings({
          urlKey: "avatarUrl",
          transformKey: "avatarTransform",
          noun: "Portrait",
          fallbackUrl: "/assets/hero/avatar.png",
        });

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 min-w-0">
              <h3 className="font-display text-lg sm:text-xl uppercase tracking-tight text-(--text-primary) border-b border-(--border-subtle) pb-3">
                2. Monogram Logo &amp; Browser Favicon
              </h3>
              <ImageUploadField
                label="Monogram Logo Image (Updates Favicon)"
                {...monogramBindings}
                folder="monogram"
                placeholder="/uploads/monogram/logo.png or https://..."
                required={false}
                previewShape="circle"
                previewSize="lg"
                previewFit="cover"
                previewAlt="Monogram & browser favicon placeholder"
                forceTouched={forceTouched}
                hint="Strict images only (.png, .jpg, .webp, .avif, .svg, .ico · max 5MB). Resize/framing updates placeholder only until you click Save & Publish."
              />
            </div>

            <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 min-w-0">
              <h3 className="font-display text-lg sm:text-xl uppercase tracking-tight text-(--text-primary) border-b border-(--border-subtle) pb-3">
                3. Hero Portrait Cutout (Avatar)
              </h3>
              <ImageUploadField
                label="Portrait Image Path or URL"
                {...avatarBindings}
                folder="hero"
                placeholder="/assets/hero/avatar.png"
                required
                previewShape="squircle"
                previewSize="lg"
                previewFit="contain"
                previewAlt="Hero portrait preview placeholder"
                forceTouched={forceTouched}
                hint="Strict images only (.png, .jpg, .webp, .avif, .svg, .ico · max 5MB). Resize/framing updates placeholder only until you click Save & Publish."
              />
            </div>
          </div>
        );
      })();

  const resumeSectionNode = (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 min-w-0">
        <h3 className="font-display text-lg sm:text-xl uppercase tracking-tight text-(--text-primary) border-b border-(--border-subtle) pb-3">
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
            <div className="flex items-center gap-2 sm:gap-1.5 w-full sm:w-auto shrink-0">
              <div className="flex-1 min-w-0 sm:flex-initial">
                <Magnetic strength={0.18} fullWidth className="sm:w-auto">
                  <label
                    className={`${FIELD_SLOT_BUTTON_CLASS} w-full sm:w-auto justify-center`}
                  >
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
              </div>

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
  );

  const rolesSectionNode = (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5 min-w-0">
        <div className="border-b border-(--border-subtle) pb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg sm:text-xl uppercase tracking-tight text-(--text-primary) min-w-0">
            5. Hero Role Titles (Top-Left Stack)
          </h3>
          <span className="text-[11px] font-mono text-(--text-muted) shrink-0 whitespace-nowrap tabular-nums">
            {draft.roles.length} active
          </span>
        </div>

        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4 items-start">
          {draft.roles.map((role, idx) => {
            const roleKey = roleIds[idx] ?? `role-fallback-${idx}`;
            return (
              <HeroRoleRow
                key={roleKey}
                index={idx}
                totalRoles={draft.roles.length}
                value={role}
                forceTouched={forceTouched}
                onChange={(nextVal) => handleUpdateRole(idx, nextVal)}
                onMove={(dir) => handleMoveRole(idx, dir)}
                onRemove={() => handleRemoveRole(idx)}
              />
            );
          })}
        </div>

        <div className="max-w-lg pt-3 border-t border-(--border-subtle)/60">
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
            wrapRightSlotOnMobile
            rightSlot={
              <FieldSlotButton
                onClick={handleAddRole}
                className="w-full sm:w-auto justify-center"
              >
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
  );

  const educationCardNode = (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5 min-w-0">
          <h3 className="font-display text-lg sm:text-xl uppercase tracking-tight text-(--text-primary) border-b border-(--border-subtle) pb-3">
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
  );

  const contactCardNode = (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3.5 sm:p-6 space-y-4 sm:space-y-5 min-w-0">
          <h3 className="font-display text-lg sm:text-xl uppercase tracking-tight text-(--text-primary) border-b border-(--border-subtle) pb-3">
            7. Contact, Social Links &amp; PSGC Address
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

            <div className="pt-3 border-t border-(--border-subtle)">
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
  );

  const mobileProfilePanels = [
    <div key="hero" className="space-y-4">
      <ProfileLivePreviewCard draft={draft} publishedProfile={savedBaseline} />
      {identitySectionNode}
      {rolesSectionNode}
    </div>,
    <div key="assets" className="space-y-4">
      {assetsMediaGridNode}
      {resumeSectionNode}
    </div>,
    educationCardNode,
    contactCardNode,
  ];

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4 sm:space-y-8">
      {/* Header & Sticky Save Bar */}
      <AdminModuleHeaderBar
        icon={<User className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />}
        title="Profile, Hero & Identity Manager"
        tooltipLabel="Profile & identity publishing rules"
        tooltipContent="Changes update the Hero headline, portrait cutout, roles, Resume PDF URL, and contact details cleanly across the live site once published. Draft state is preserved locally while editing."
        subtitle="Manage identity typography, monogram & browser tab favicon, portrait cutout, roles, birth date, education, and PSGC location."
        liveErrorsCount={forceTouched ? liveErrorsCount : 0}
        onFollowIssue={() => jumpToValidationIssue("next")}
        hasUnsavedChanges={hasUnsavedChanges}
        onDiscard={handleDiscardDraft}
        saving={saving}
      />

      {formError && (
        <AdminAlertBanner
          variant="error"
          message={formError}
          actionLabel={forceTouched ? "Follow Issue" : undefined}
          onAction={
            forceTouched ? () => jumpToValidationIssue("next") : undefined
          }
          onDismiss={() => setFormError(null)}
        />
      )}

      {isMobileOrTablet ? (
        <AdminMobileStepView
          ariaLabel="Profile and hero sections"
          steps={mobileSteps}
          activeStep={activeStep}
          direction={stepDirection}
          onChangeStep={(next) => switchStep(next as ProfileStep)}
          finalAction={{
            label: saving ? "Saving..." : "Save & Publish",
            type: "submit",
            variant: "primary",
            disabled: saving,
            icon: <Save className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
          }}
        >
          {mobileProfilePanels[activeStep] ?? mobileProfilePanels[0]}
        </AdminMobileStepView>
      ) : (
        <>
          <ProfileLivePreviewCard draft={draft} publishedProfile={savedBaseline} />
          {identitySectionNode}
          {assetsMediaGridNode}
          {resumeSectionNode}
          {rolesSectionNode}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
            {educationCardNode}
            {contactCardNode}
          </div>
        </>
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
