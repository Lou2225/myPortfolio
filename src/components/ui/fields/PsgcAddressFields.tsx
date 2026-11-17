"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, MapPin, RefreshCw, RotateCcw } from "lucide-react";
import { PsgcAddress } from "@/types/portfolio";
import {
  fetchPsgcRegions,
  fetchPsgcProvincesByRegion,
  fetchPsgcCitiesByProvince,
  fetchPsgcCitiesByRegion,
  fetchPsgcBarangaysByCity,
  formatPsgcLocation,
} from "@/lib/psgc";
import { SearchableSelectField } from "./SearchableSelectField";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { TruncatedText } from "@/components/ui/Tooltip";
import { Collapsible } from "@/components/motion/Collapsible";
import { cn } from "@/lib/utils";

const PSGC_STALE_MS = 24 * 60 * 60 * 1000;

export interface PsgcAddressFieldsProps {
  address?: PsgcAddress;
  formattedLocation: string;
  onChange: (
    nextAddress: PsgcAddress | undefined,
    nextFormattedLocation: string
  ) => void;
  forceTouched?: boolean;
  validationAttempt?: number;
  className?: string;
}

/**
 * Compact expandable PSGC selector. Displays only the Public Location Display
 * preview by default; clicking expands the 4 searchable cascading dropdowns
 * (Region -> Province -> City/Municipality -> Barangay) built on DropdownPopover.
 */
export function PsgcAddressFields({
  address,
  formattedLocation,
  onChange,
  forceTouched = false,
  validationAttempt = 0,
  className,
}: PsgcAddressFieldsProps) {
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [followSignal, setFollowSignal] = useState(0);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [suppressedAttempt, setSuppressedAttempt] = useState<number>(-1);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    const handleFollowInvalid = () => {
      setIsConfiguring(true);
      setFollowSignal((n) => n + 1);
    };
    el?.addEventListener("lou-follow-invalid", handleFollowInvalid);

    return () => {
      el?.removeEventListener("lou-follow-invalid", handleFollowInvalid);
    };
  }, []);

  const handleToggleConfiguring = () => {
    setIsConfiguring((prev) => !prev);
  };

  const regionCode = address?.regionCode || "";
  const provinceCode = address?.provinceCode || "";
  const cityCode = address?.cityCode || "";
  const barangayCode = address?.barangayCode || "";

  const regionsQuery = useQuery({
    queryKey: ["psgc", "regions"],
    queryFn: fetchPsgcRegions,
    enabled: isConfiguring,
    staleTime: PSGC_STALE_MS,
  });

  const provincesQuery = useQuery({
    queryKey: ["psgc", "provinces", regionCode],
    queryFn: () => fetchPsgcProvincesByRegion(regionCode),
    enabled: isConfiguring && Boolean(regionCode),
    staleTime: PSGC_STALE_MS,
  });

  const regions = regionsQuery.data ?? [];
  const provinces = provincesQuery.data ?? [];
  const isNcrOrDirectRegion =
    Boolean(regionCode) &&
    provincesQuery.isFetched &&
    !provincesQuery.isError &&
    provinces.length === 0;

  const citiesQuery = useQuery({
    queryKey: [
      "psgc",
      "cities",
      isNcrOrDirectRegion ? "region" : "province",
      isNcrOrDirectRegion ? regionCode : provinceCode,
    ],
    queryFn: () =>
      isNcrOrDirectRegion
        ? fetchPsgcCitiesByRegion(regionCode)
        : fetchPsgcCitiesByProvince(provinceCode),
    enabled:
      isConfiguring &&
      Boolean(regionCode && (isNcrOrDirectRegion || provinceCode)),
    staleTime: PSGC_STALE_MS,
  });

  const barangaysQuery = useQuery({
    queryKey: ["psgc", "barangays", cityCode],
    queryFn: () => fetchPsgcBarangaysByCity(cityCode),
    enabled: isConfiguring && Boolean(cityCode),
    staleTime: PSGC_STALE_MS,
  });

  const cities = citiesQuery.data ?? [];
  const barangays = barangaysQuery.data ?? [];

  const firstQueryError =
    regionsQuery.error ||
    provincesQuery.error ||
    citiesQuery.error ||
    barangaysQuery.error;
  const psgcErrorMessage =
    firstQueryError instanceof Error ? firstQueryError.message : null;

  const requiresSubLevels = Boolean(regionCode);
  const cascadeForceTouched = forceTouched && validationAttempt > suppressedAttempt;
  const hasIncompletePsgc =
    cascadeForceTouched && Boolean(regionCode) && !Boolean(cityCode);

  const handleRetryPsgc = () => {
    void regionsQuery.refetch();
    if (regionCode) void provincesQuery.refetch();
    if (provinceCode || isNcrOrDirectRegion) void citiesQuery.refetch();
    if (cityCode) void barangaysQuery.refetch();
  };

  const handleRegionChange = (nextCode: string) => {
    setSuppressedAttempt(validationAttempt);
    if (!nextCode) {
      onChange(undefined, "Philippines");
      return;
    }
    const found = regions.find((r) => r.code === nextCode);
    const labelName = found
      ? found.name === "NCR"
        ? "Metro Manila (NCR)"
        : `${found.name} (${found.regionName})`
      : address?.regionName || "";

    const nextAddress: PsgcAddress = {
      regionCode: nextCode,
      regionName: labelName,
      provinceCode: "",
      provinceName: "",
      cityCode: "",
      cityName: "",
      barangayCode: "",
      barangayName: "",
    };
    onChange(nextAddress, formatPsgcLocation(nextAddress) || "Philippines");
  };

  const handleProvinceChange = (nextCode: string) => {
    if (!address) return;
    setSuppressedAttempt(validationAttempt);
    const found = provinces.find((p) => p.code === nextCode);
    const nextAddress: PsgcAddress = {
      ...address,
      provinceCode: nextCode,
      provinceName: found?.name || "",
      cityCode: "",
      cityName: "",
      barangayCode: "",
      barangayName: "",
    };
    onChange(nextAddress, formatPsgcLocation(nextAddress));
  };

  const handleCityChange = (nextCode: string) => {
    if (!address) return;
    const found = cities.find((c) => c.code === nextCode);
    const nextAddress: PsgcAddress = {
      ...address,
      cityCode: nextCode,
      cityName: found?.name || "",
      barangayCode: "",
      barangayName: "",
    };
    onChange(nextAddress, formatPsgcLocation(nextAddress));
  };

  const handleBarangayChange = (nextCode: string) => {
    if (!address) return;
    const found = barangays.find((b) => b.code === nextCode);
    const nextAddress: PsgcAddress = {
      ...address,
      barangayCode: nextCode,
      barangayName: found?.name || "",
    };
    onChange(nextAddress, formatPsgcLocation(nextAddress));
  };

  const regionOptions = regions.map((r) => ({
    value: r.code,
    label:
      r.name === "NCR"
        ? "NCR — National Capital Region"
        : `${r.regionName} — ${r.name}`,
  }));
  if (
    regionCode &&
    !regionOptions.some((o) => o.value === regionCode) &&
    address?.regionName
  ) {
    regionOptions.unshift({ value: regionCode, label: address.regionName });
  }

  const provinceOptions = provinces.map((p) => ({
    value: p.code,
    label: p.name,
  }));
  if (
    provinceCode &&
    !provinceOptions.some((o) => o.value === provinceCode) &&
    address?.provinceName
  ) {
    provinceOptions.unshift({
      value: provinceCode,
      label: address.provinceName,
    });
  }

  const cityOptions = cities.map((c) => ({
    value: c.code,
    label: c.name,
  }));
  if (
    cityCode &&
    !cityOptions.some((o) => o.value === cityCode) &&
    address?.cityName
  ) {
    cityOptions.unshift({ value: cityCode, label: address.cityName });
  }

  const barangayOptions = barangays.map((b) => ({
    value: b.code,
    label: b.name,
  }));
  if (
    barangayCode &&
    !barangayOptions.some((o) => o.value === barangayCode) &&
    address?.barangayName
  ) {
    barangayOptions.unshift({
      value: barangayCode,
      label: address.barangayName,
    });
  }

  return (
    <div
      ref={sectionRef}
      data-field-invalid={hasIncompletePsgc ? "true" : undefined}
      data-field-label="Location (PSGC)"
      className={cn("scroll-mt-40", className)}
    >
      {/* Compact Clickable Public Location Display Trigger */}
      <div>
        <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-secondary) font-medium block mb-1.5 select-none">
          Location (PSGC)
        </span>
        <button
          type="button"
          onClick={handleToggleConfiguring}
          aria-expanded={isConfiguring}
          className={cn(
            "w-full text-left rounded-(--radius-control) bg-(--bg-surface-2) border px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors group",
            hasIncompletePsgc
              ? "border-brand"
              : isConfiguring
                ? "border-brand/70"
                : "border-(--border-subtle) hover:border-brand/60"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <MapPin className="w-4 h-4 text-(--text-accent) shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted)">
                  Public Location Display
                </span>
                {address?.cityCode && (
                  <span className="px-1.5 py-0.5 rounded-(--radius-control) bg-brand/10 border border-brand/30 text-[9px] font-mono text-(--text-accent)">
                    PSGC {address.barangayCode || address.cityCode}
                  </span>
                )}
              </div>
              <TruncatedText
                text={formattedLocation || "Philippines"}
                className="text-xs sm:text-sm font-medium text-(--text-primary) block mt-0.5"
              />
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-(--text-muted) group-hover:text-(--text-accent) shrink-0">
            <span>{isConfiguring ? "Done" : "Configure"}</span>
            <ChevronDown
              className={cn(
                "w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                isConfiguring && "rotate-180 text-(--text-accent)"
              )}
            />
          </span>
        </button>

        {hasIncompletePsgc && !isConfiguring && (
          <p role="alert" className="text-[11px] font-mono text-(--text-accent) mt-1.5">
            PSGC selection incomplete — click above to finish picking City / Municipality.
          </p>
        )}
      </div>

      {/* Smoothly Animated Expand / Collapse PSGC Configuration Panel */}
      <Collapsible
        open={isConfiguring}
        containerRef={sectionRef}
        followOnOpen
        allowOverflowWhenOpen
        followSignal={followSignal}
        contentClassName="pt-3.5"
      >
        <div className="rounded-(--radius-control) bg-(--bg-surface-2)/60 border border-(--border-subtle) p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-(--border-subtle)">
              <span className="text-[11px] font-mono uppercase tracking-wider text-(--text-secondary)">
                Search & Select Philippine Standard Geographic Code
              </span>

              <div className="flex items-center gap-3">
                {psgcErrorMessage && (
                  <button
                    type="button"
                    onClick={handleRetryPsgc}
                    tabIndex={isConfiguring ? 0 : -1}
                    className="text-[11px] font-mono text-(--text-accent) hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry PSGC</span>
                  </button>
                )}
                {regionCode && (
                  <button
                    type="button"
                    onClick={() => setConfirmResetOpen(true)}
                    tabIndex={isConfiguring ? 0 : -1}
                    className="text-[11px] font-mono text-(--text-muted) hover:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Remove Address</span>
                  </button>
                )}
              </div>
            </div>

            {psgcErrorMessage && (
              <p className="text-[11px] font-mono text-(--text-accent) bg-brand/10 border border-brand/30 rounded-(--radius-control) px-3 py-2">
                {psgcErrorMessage} Showing saved location while PSGC directory is offline.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <SearchableSelectField
                label="PSGC Region"
                value={regionCode}
                options={regionOptions}
                onChange={handleRegionChange}
                placeholder="Select Region..."
                searchPlaceholder="Search region (e.g. NCR, Region IV-A)..."
                loading={regionsQuery.isFetching}
                required={false}
                disabled={!isConfiguring}
                forceTouched={forceTouched}
              />

              <SearchableSelectField
                key={`province-${regionCode || "empty"}`}
                label="PSGC Province"
                value={provinceCode}
                options={provinceOptions}
                onChange={handleProvinceChange}
                placeholder={
                  !regionCode
                    ? "Select Region first..."
                    : isNcrOrDirectRegion
                      ? "Not applicable (NCR / Direct Cities)"
                      : "Select Province..."
                }
                searchPlaceholder="Search province..."
                loading={provincesQuery.isFetching}
                required={requiresSubLevels && !isNcrOrDirectRegion}
                disabled={!isConfiguring || !regionCode || isNcrOrDirectRegion}
                forceTouched={cascadeForceTouched}
              />

              <SearchableSelectField
                key={`city-${regionCode || "empty"}-${provinceCode || "empty"}`}
                label="City / Municipality"
                value={cityCode}
                options={cityOptions}
                onChange={handleCityChange}
                placeholder={
                  !regionCode
                    ? "Select Region first..."
                    : !isNcrOrDirectRegion && !provinceCode
                      ? "Select Province first..."
                      : "Select City / Municipality..."
                }
                searchPlaceholder="Search city or municipality..."
                loading={citiesQuery.isFetching}
                required={requiresSubLevels}
                disabled={
                  !isConfiguring ||
                  !regionCode ||
                  (!isNcrOrDirectRegion && !provinceCode)
                }
                forceTouched={cascadeForceTouched}
              />

              <SearchableSelectField
                key={`barangay-${cityCode || "empty"}`}
                label="Barangay (Optional)"
                value={barangayCode}
                options={barangayOptions}
                onChange={handleBarangayChange}
                placeholder={
                  !cityCode
                    ? "Select City first..."
                    : "Select Barangay (Optional)..."
                }
                searchPlaceholder="Search barangay..."
                loading={barangaysQuery.isFetching}
                required={false}
                allowClear
                disabled={!isConfiguring || !cityCode}
                forceTouched={cascadeForceTouched}
              />
            </div>
        </div>
      </Collapsible>

      <ConfirmModal
        open={confirmResetOpen}
        variant="danger"
        title="Remove PSGC Address?"
        description="This clears your selected Region, Province, City/Municipality, and Barangay and resets your public Location display back to 'Philippines'."
        confirmLabel="Remove Address"
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          onChange(undefined, "Philippines");
          setConfirmResetOpen(false);
        }}
      />
    </div>
  );
}
