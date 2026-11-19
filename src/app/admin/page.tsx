import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  checkStealthGateAccess,
  createStealthUnlockPass,
  getAdminAuthMeta,
  getSessionAndDeviceContext,
} from "@/lib/auth";
import { getPortfolioDB, getStorageMode } from "@/lib/db";
import {
  appendSecurityAudit,
  checkSecurityRateLimit,
  clearSecurityRateBucket,
  extractRequestNetworkInfo,
  mutateAdminSecurityStore,
  readAdminSecurityStore,
  recordSecurityRateFailure,
  toSafeSecuritySummary,
} from "@/lib/security";
import type { SafeSecuritySummary } from "@/types/security";
import {
  parseAdminTab,
  parseSettingsSection,
} from "@/components/admin/layout/types";
import {
  AdminDashboardClient,
  AdminAuthStatus,
} from "@/components/admin/AdminDashboardClient";
import type { AdminPortfolioPayload } from "@/lib/queryClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portfolio CMS — Restricted",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

interface AdminPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Server Component Entry for `/admin`.
 * Enforces the Stealth Gate (`404 Not Found` for unregistered visitors when enabled),
 * resolves authentication, device registration, portfolio DB, and URL state directly on SSR.
 */
export default async function AdminPage({ searchParams }: AdminPageProps) {
  const resolvedParams = await searchParams;
  const rawPortal = Array.isArray(resolvedParams?.portal)
    ? resolvedParams.portal[0]
    : resolvedParams?.portal;

  const trimmedPortal = rawPortal?.trim() || null;
  let portalRateKey: string | null = null;
  let reqHeaders: Headers | null = null;

  if (trimmedPortal) {
    reqHeaders = await headers();
    const reqInfo = extractRequestNetworkInfo(reqHeaders);
    portalRateKey = `portal:${reqInfo.ipRateKey}`;

    try {
      const store = await readAdminSecurityStore();
      const rate = checkSecurityRateLimit(store, portalRateKey);
      if (!rate.allowed) {
        notFound();
      }
    } catch {
      notFound();
    }
  }

  const [stealthAccess, ctx] = await Promise.all([
    checkStealthGateAccess({ portalKey: trimmedPortal }),
    getSessionAndDeviceContext(),
  ]);

  if (!stealthAccess.allowed) {
    if (trimmedPortal && portalRateKey && reqHeaders && !stealthAccess.storageUnavailable) {
      const reqInfo = extractRequestNetworkInfo(reqHeaders);
      try {
        await mutateAdminSecurityStore((store) => {
          const penalized = recordSecurityRateFailure(store, portalRateKey!, {
            maxFailures: 6,
          });
          return appendSecurityAudit(penalized, {
            action: "login_blocked",
            actorDeviceId: null,
            targetDeviceId: null,
            deviceLabel: "Invalid ?portal= Key Probe",
            ipMasked: reqInfo.ipMasked,
            outcome: "blocked",
            detail: "Incorrect ?portal= stealth recovery key tested on /admin.",
          });
        });
      } catch {
        // Do not expose error details on 404 stealth gate
      }
    }
    notFound();
  }

  if (stealthAccess.unlockedViaKey && portalRateKey) {
    try {
      await mutateAdminSecurityStore((store) =>
        clearSecurityRateBucket(store, portalRateKey!)
      );
    } catch {
      // Non-fatal rate-limit cleanup
    }
  }

  const stealthUnlockToken = stealthAccess.unlockedViaKey
    ? createStealthUnlockPass()
    : null;

  const storageMode = getStorageMode();
  const rawTab = Array.isArray(resolvedParams?.tab)
    ? resolvedParams.tab[0]
    : resolvedParams?.tab;
  const initialTab = parseAdminTab(rawTab);

  const rawSection = Array.isArray(resolvedParams?.section)
    ? resolvedParams.section[0]
    : resolvedParams?.section;
  const initialSettingsSection = parseSettingsSection(rawSection);

  const authMeta = ctx.authenticated ? await getAdminAuthMeta() : null;

  const initialAuth: AdminAuthStatus = {
    authenticated: ctx.authenticated,
    deviceRegistered: ctx.deviceRegistered,
    storageMode,
    passwordSource: authMeta?.passwordSource,
    envConfigured: authMeta?.envConfigured,
    overrideUpdatedAt: authMeta?.overrideUpdatedAt ?? null,
  };

  let initialPortfolio: AdminPortfolioPayload | undefined;
  let initialSecuritySummary: SafeSecuritySummary | undefined;
  if (ctx.authenticated) {
    const [db, securityStore] = await Promise.all([
      getPortfolioDB({ bypassCache: true }),
      readAdminSecurityStore(),
    ]);
    initialPortfolio = {
      data: db,
      storageMode,
    };
    initialSecuritySummary = toSafeSecuritySummary(
      securityStore,
      ctx.currentDeviceId
    );
  }

  return (
    <AdminDashboardClient
      key={initialTab}
      initialAuth={initialAuth}
      initialPortfolio={initialPortfolio}
      initialSecuritySummary={initialSecuritySummary}
      initialTab={initialTab}
      initialSettingsSection={initialSettingsSection}
      stealthUnlockToken={stealthUnlockToken}
    />
  );
}
