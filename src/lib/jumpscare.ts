import type { JumpscareTriggerMode } from "@/types/portfolio";

export const JUMPSCARE_TRIGGER_EVENT = "lou-trigger-jumpscare";
export const JUMPSCARE_SESSION_KEY = "lou_jumpscare_triggered_v1";

export type JumpscareTriggerSource = JumpscareTriggerMode | "preview";

export interface JumpscareTriggerDetail {
  source: JumpscareTriggerSource;
  forceReplay?: boolean;
}

export function dispatchJumpscareTrigger(
  source: JumpscareTriggerSource,
  forceReplay = false
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<JumpscareTriggerDetail>(JUMPSCARE_TRIGGER_EVENT, {
      detail: { source, forceReplay },
    })
  );
}

export function hasPrankQueryParam(search: string): boolean {
  if (!search) return false;
  try {
    const params = new URLSearchParams(search);
    return params.get("prank") === "1";
  } catch {
    return false;
  }
}

let prankQueryArmedInPage = false;

export function armPrankQueryForPage(): void {
  prankQueryArmedInPage = true;
}

export function isPrankQueryArmed(): boolean {
  return prankQueryArmedInPage;
}

export function clearPrankQueryArmed(): void {
  prankQueryArmedInPage = false;
}

export function hasFiredJumpscareThisSession(
  storage?: Pick<Storage, "getItem"> | null
): boolean {
  try {
    const store =
      storage ??
      (typeof window !== "undefined" ? window.sessionStorage : null);
    return store?.getItem(JUMPSCARE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markJumpscareFiredThisSession(
  storage?: Pick<Storage, "setItem"> | null
): void {
  try {
    const store =
      storage ??
      (typeof window !== "undefined" ? window.sessionStorage : null);
    store?.setItem(JUMPSCARE_SESSION_KEY, "1");
  } catch {
    // Ignore storage quota / privacy mode restrictions
  }
}
