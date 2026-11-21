import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearBrandPortalWorkspace,
  dismissBrandPortalNotice,
  getActiveBrandPortalDraft,
  setBrandPortalWorkspace,
  triggerBrandPortalDiscard,
  triggerBrandPortalFollowIssue,
  triggerBrandPortalSave,
} from "@/lib/brandPortalStatus";

describe("brandPortalStatus workspace command registry", () => {
  afterEach(() => {
    clearBrandPortalWorkspace("profile-hero");
    clearBrandPortalWorkspace("projects");
    clearBrandPortalWorkspace("settings-password");
    dismissBrandPortalNotice();
  });

  it("registers module actions and dispatches save, discard, and follow issue handlers", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onFollowIssue = vi.fn();

    setBrandPortalWorkspace(
      {
        moduleId: "profile-hero",
        moduleLabel: "Profile & Hero",
        hasUnsavedChanges: true,
        saving: false,
        saveLabel: "Save & Publish",
        validationErrorCount: 2,
        canSave: true,
        canDiscard: true,
        hasFollowIssue: true,
      },
      { onSave, onDiscard, onFollowIssue }
    );

    expect(getActiveBrandPortalDraft()).toEqual({
      hasUnsavedChanges: true,
      moduleLabel: "Profile & Hero",
    });

    expect(triggerBrandPortalSave()).toBe(true);
    expect(triggerBrandPortalDiscard()).toBe(true);
    expect(triggerBrandPortalFollowIssue()).toBe(true);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onFollowIssue).toHaveBeenCalledTimes(1);
  });

  it("blocks save and discard while a save is in progress or when disabled", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();

    setBrandPortalWorkspace(
      {
        moduleId: "projects",
        moduleLabel: "Projects",
        hasUnsavedChanges: true,
        saving: true,
        saveLabel: "Save & Publish",
        validationErrorCount: 0,
        canSave: true,
        canDiscard: true,
        hasFollowIssue: false,
      },
      { onSave, onDiscard }
    );

    expect(triggerBrandPortalSave()).toBe(false);
    expect(triggerBrandPortalDiscard()).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();

    setBrandPortalWorkspace(
      {
        moduleId: "projects",
        moduleLabel: "Projects",
        hasUnsavedChanges: false,
        saving: false,
        saveLabel: "Save & Publish",
        validationErrorCount: 0,
        canSave: false,
        canDiscard: false,
        hasFollowIssue: false,
      },
      { onSave, onDiscard }
    );

    expect(triggerBrandPortalSave()).toBe(false);
    expect(triggerBrandPortalDiscard()).toBe(false);
  });

  it("isolates clearBrandPortalWorkspace so an unmounting stale module cannot clobber the active module", () => {
    const onPasswordSave = vi.fn();

    setBrandPortalWorkspace(
      {
        moduleId: "settings-password",
        moduleLabel: "Admin Password",
        hasUnsavedChanges: true,
        saving: false,
        saveLabel: "Update Password",
        validationErrorCount: 0,
        canSave: true,
        canDiscard: true,
        hasFollowIssue: false,
      },
      { onSave: onPasswordSave }
    );

    // Clearing a different module must not wipe the active workspace or its handler
    clearBrandPortalWorkspace("profile-hero");

    expect(getActiveBrandPortalDraft()).toEqual({
      hasUnsavedChanges: true,
      moduleLabel: "Admin Password",
    });
    expect(triggerBrandPortalSave()).toBe(true);
    expect(onPasswordSave).toHaveBeenCalledTimes(1);

    // Clearing the matching module resets draft state and detaches handlers
    clearBrandPortalWorkspace("settings-password");
    expect(getActiveBrandPortalDraft()).toEqual({
      hasUnsavedChanges: false,
      moduleLabel: "",
    });
    expect(triggerBrandPortalSave()).toBe(false);
  });
});
