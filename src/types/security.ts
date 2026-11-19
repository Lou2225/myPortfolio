export type DeviceType = "desktop" | "mobile" | "tablet";

export type DeviceTrustSource =
  | "login"
  | "manual"
  | "qr-pair"
  | "stealth-unlock"
  | "totp"
  | "passkey";

export type DeviceStatus = "active" | "revoked";

export interface ClientDeviceTelemetry {
  suggestedName: string;
  model: string;
  platform: string;
  osVersion: string;
  browser: string;
  architecture: string | null;
  cpuCores: number | null;
  gpuRenderer: string | null;
  screenMetrics: string | null;
  timezone: string | null;
  deviceType: DeviceType;
  keyThumbprint: string | null;
  publicKeySpki: string | null;
  secureContext: boolean;
}

export interface TrustedDevice {
  id: string;
  name: string;
  model: string;
  platform: string;
  osVersion: string;
  browser: string;
  architecture: string | null;
  cpuCores: number | null;
  gpuRenderer: string | null;
  screenMetrics: string | null;
  timezone: string | null;
  deviceType: DeviceType;
  keyThumbprint: string | null;
  publicKeySpki: string | null;
  /** All WebCrypto ECDSA keypairs (keyThumbprint -> publicKeySpki) across browsers on this physical device */
  browserKeys?: Record<string, string>;
  /** All browsers recognized on this physical device (e.g. ["Brave", "Chrome", "Microsoft Edge"]) */
  browsers?: string[];
  ipMasked: string;
  userAgent: string;
  trustSource: DeviceTrustSource;
  status: DeviceStatus;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export type PairingChallengeStatus =
  | "pending"
  | "awaiting_approval"
  | "approved"
  | "completed"
  | "expired"
  | "burned"
  | "cancelled";

export interface PairedDevicePreview {
  name: string;
  model: string;
  platform: string;
  osVersion: string;
  browser: string;
  architecture: string | null;
  cpuCores: number | null;
  gpuRenderer: string | null;
  screenMetrics: string | null;
  timezone: string | null;
  deviceType: DeviceType;
  keyThumbprint: string | null;
  publicKeySpki: string | null;
  /** All WebCrypto ECDSA keypairs (keyThumbprint -> publicKeySpki) across browsers on this physical device */
  browserKeys?: Record<string, string>;
  /** All browsers recognized on this physical device (e.g. ["Brave", "Chrome", "Microsoft Edge"]) */
  browsers?: string[];
  ipMasked: string;
  userAgent: string;
  verifiedAt: string;
}

export interface PairingChallenge {
  id: string;
  codeHash: string;
  claimTokenHash: string | null;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  maxAttempts: number;
  grantAdminSession: boolean;
  requireDesktopApproval: boolean;
  status: PairingChallengeStatus;
  createdByDeviceId: string | null;
  pendingDevice: PairedDevicePreview | null;
  pairedDeviceId: string | null;
}

export interface DevicePasskey {
  credentialId: string;
  publicKeySpki: string;
  algorithm: number;
  counter: number;
  transports: string[];
  aaguid: string | null;
  authenticatorLabel: string;
  backedUp: boolean;
  rpId: string;
  deviceId: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export type SecurityAuditAction =
  | "login_success"
  | "login_failed"
  | "login_blocked"
  | "device_registered"
  | "device_updated"
  | "device_qr_paired"
  | "device_revoked"
  | "password_changed"
  | "sessions_revoked"
  | "stealth_toggled"
  | "stealth_unlock"
  | "totp_updated"
  | "passkey_registered"
  | "passkey_login"
  | "passkey_revoked";

export type SecurityAuditOutcome = "success" | "blocked" | "info";

export interface SecurityAuditEvent {
  id: string;
  action: SecurityAuditAction;
  actorDeviceId: string | null;
  targetDeviceId: string | null;
  deviceLabel: string;
  ipMasked: string;
  outcome: SecurityAuditOutcome;
  detail: string;
  createdAt: string;
}

export interface LoginRateLimitBucket {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number | null;
}

export interface AdminSecurityStore {
  sessionEpoch: number;
  stealthGateEnabled: boolean;
  devices: TrustedDevice[];
  passkeys?: DevicePasskey[];
  pairings: PairingChallenge[];
  auditLog: SecurityAuditEvent[];
  loginFailures: Record<string, LoginRateLimitBucket>;
  updatedAt: string;
}

export interface SafeSecuritySummary {
  sessionEpoch: number;
  stealthGateEnabled: boolean;
  stealthKeyConfigured: boolean;
  totpEnabled: boolean;
  currentDeviceId: string | null;
  activeDeviceCount: number;
  devices: TrustedDevice[];
  passkeys: DevicePasskey[];
  auditLog: SecurityAuditEvent[];
  pendingPairings: Array<{
    id: string;
    status: PairingChallengeStatus;
    expiresAt: string;
    pendingDevice: PairedDevicePreview | null;
    grantAdminSession: boolean;
  }>;
}
