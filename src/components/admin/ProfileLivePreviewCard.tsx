"use client";

import { Profile } from "@/types/portfolio";
import { MonogramBadge } from "@/components/common/MonogramBadge";
import { TransformedImage } from "@/components/ui/TransformedImage";
import { TruncatedText } from "@/components/ui/Tooltip";
import { calculateAge, formatBirthDateReadable } from "@/lib/date";
import { useInstantImageUrl } from "@/lib/instantImageCache";
import { Globe, MapPin, Cake } from "lucide-react";

interface ProfileLivePreviewCardProps {
  draft: Profile;
  publishedProfile?: Profile;
}

/**
 * Clean executive preview of how the published browser tab favicon, monogram
 * badge, full identity, computed age, and PSGC location appear across the portfolio.
 * Brand logo badges & tab icon reflect the live published state until Save & Publish.
 */
export function ProfileLivePreviewCard({
  draft,
  publishedProfile,
}: ProfileLivePreviewCardProps) {
  const liveMediaSource = publishedProfile ?? draft;
  const computedAge = calculateAge(draft.birthDate) ?? draft.age;
  const birthLabel = draft.birthDate
    ? formatBirthDateReadable(draft.birthDate)
    : "Not set";
  const resolvedMonogramUrl = useInstantImageUrl(
    liveMediaSource.monogramImageUrl
  );
  const tabIcon = resolvedMonogramUrl || "/icons/icon-192.png";
  const fullDisplay =
    draft.fullName?.trim() ||
    [draft.name, draft.middleName, draft.lastName].filter(Boolean).join(" ") ||
    "Lou Diamond Valdellon";
  const tabTitle = `${draft.name} ${draft.lastName} — ${draft.headline}`;
  const locationDisplay = draft.contact.location || "Philippines";

  return (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-5 sm:p-6 space-y-5">
      {/* Header Row & Simulated Browser Tab */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-(--border-subtle)">
        <div className="min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-(--text-accent) block">
            Live Identity & Browser Tab Preview
          </span>
          <p className="text-xs text-(--text-muted) mt-0.5">
            Reflects how your published monogram logo, favicon, age, and PSGC location render sitewide.
          </p>
        </div>

        {/* Simulated Browser Tab */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-t-md bg-(--bg-surface-2) border border-(--border-subtle) max-w-full sm:max-w-xs min-w-0">
          <span className="w-4 h-4 rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center">
            {resolvedMonogramUrl ? (
              <TransformedImage
                src={resolvedMonogramUrl}
                alt="Browser tab favicon preview"
                transform={liveMediaSource.monogramTransform}
                defaultFit="cover"
                className="w-full h-full"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tabIcon}
                alt="Browser tab favicon preview"
                className="w-full h-full rounded-full object-cover"
              />
            )}
          </span>
          <TruncatedText
            text={tabTitle}
            className="text-[11px] font-medium text-(--text-primary) block flex-1 min-w-0"
          />
          <Globe className="w-3 h-3 text-(--text-muted) shrink-0" />
        </div>
      </div>

      {/* Clean Executive Identity & Metadata Row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <MonogramBadge
            monogram={liveMediaSource.monogram}
            imageUrl={liveMediaSource.monogramImageUrl}
            transform={liveMediaSource.monogramTransform}
            alt={`${fullDisplay} monogram preview`}
            className={
              liveMediaSource.monogramImageUrl
                ? "w-16 h-16 rounded-full border border-brand/80 bg-transparent text-(--text-accent) font-bold text-sm tracking-wider"
                : "w-16 h-16 rounded-full border border-brand bg-brand/10 text-(--text-accent) font-bold text-sm tracking-wider"
            }
          />
          <div className="min-w-0 flex-1">
            <TruncatedText
              as="p"
              text={fullDisplay}
              className="text-base font-semibold text-(--text-primary) tracking-tight block"
            />
            <TruncatedText
              as="p"
              text={
                draft.headline ||
                "Full-Stack Developer & Business Analytics Specialist"
              }
              className="text-xs text-(--text-muted) mt-0.5 block"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:justify-end min-w-0">
          <div className="inline-flex items-center gap-2 text-center shrink-0">
            <Cake className="w-4 h-4 text-(--text-accent) shrink-0" />
            <span className="text-xs sm:text-sm font-medium text-(--text-primary) tabular-nums whitespace-nowrap">
              {computedAge} yrs{" "}
              <span className="text-xs font-mono font-normal text-(--text-muted)">
                ({birthLabel})
              </span>
            </span>
          </div>

          <span
            aria-hidden="true"
            className="hidden sm:inline-block w-px h-5 bg-(--border-subtle)"
          />

          <div className="inline-flex items-center gap-2 min-w-0 max-w-full sm:max-w-xs">
            <MapPin className="w-4 h-4 text-(--text-accent) shrink-0" />
            <TruncatedText
              text={locationDisplay}
              className="text-xs sm:text-sm font-medium text-(--text-primary) block"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
