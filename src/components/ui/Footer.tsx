"use client";

import { usePathname } from "next/navigation";
import { usePortfolio } from "@/context/PortfolioContext";
import { useOfflineStatus } from "@/components/pwa/OfflineManager";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import { MonogramBadge } from "@/components/common/MonogramBadge";
import { Magnetic } from "@/components/motion/Magnetic";
import { DisplayHeading, MonoLabel } from "@/components/ui/Typography";
import { dispatchJumpscareTrigger } from "@/lib/jumpscare";
import { ArrowUpRight, Download, Ghost, Github, Linkedin, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export function Footer() {
  const { profile, appearance, sectionHeaders, trackEvent } = usePortfolio();
  const { isOnline, canInstall, promptInstall } = useOfflineStatus();
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();

  if (pathname?.startsWith("/admin")) return null;

  const showInstall = isOnline && canInstall;

  const handleInstallClick = async () => {
    const accepted = await promptInstall();
    if (accepted) {
      announceBrandPortalStatus({
        tone: "live",
        label: "App Installed",
        detail: "Added shortcut to your device",
        durationMs: 3600,
      });
    }
  };

  return (
    <footer className="lou-public-footer relative z-10 w-full border-t border-(--border-subtle) bg-(--bg-canvas)/88 pt-8 sm:pt-14 pb-5 sm:pb-10 px-(--gutter)">
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-6 sm:gap-10">
        {/* Top Footer Row: Identity Signature & Uniform Action Grid */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 sm:gap-8">
          {/* Left: Monogram + Name + Tagline + Live Availability Pill */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <MonogramBadge
                monogram={profile.monogram}
                imageUrl={profile.monogramImageUrl}
                transform={profile.monogramTransform}
                alt={`${profile.name} monogram`}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-(--border-strong) font-bold text-xs tracking-wider text-(--text-accent) bg-(--bg-surface) shrink-0"
              />
              <div className="min-w-0">
                <DisplayHeading as="span" size="md" className="block truncate">
                  {profile.fullName}
                </DisplayHeading>
                <MonoLabel as="p" tone="muted" className="mt-0.5 truncate">
                  {sectionHeaders.footerTagline}
                </MonoLabel>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-(--bg-surface) border border-(--border-subtle) text-[0.6875rem] text-(--text-success) font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-(--text-success) animate-pulse shrink-0" />
              <span className="truncate">{profile.contact.status}</span>
            </div>
          </div>

          {/* Right: Uniform Tactile Social & PWA Action Cards (2x2 on mobile when 4 items, 1x3 when 3 items) */}
          <div
            className={cn(
              "grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5 w-full lg:w-auto",
              showInstall ? "grid-cols-2" : "grid-cols-3"
            )}
          >
            <Magnetic strength={0.14} className="w-full sm:w-auto">
              <a
                href={profile.contact.github}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("contact_click", "Footer GitHub")}
                className="h-[2.375rem] px-3 sm:px-4 rounded-(--radius-control) bg-(--bg-surface) border border-(--border-subtle) hover:border-brand/50 text-[0.6875rem] font-mono uppercase tracking-[0.14em] text-(--text-secondary) hover:text-(--text-primary) flex items-center justify-between sm:justify-center gap-2 transition-colors"
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Github className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
                  <span>GitHub</span>
                </span>
                <ArrowUpRight className="w-3 h-3 text-(--text-muted) shrink-0" />
              </a>
            </Magnetic>

            <Magnetic strength={0.14} className="w-full sm:w-auto">
              <a
                href={profile.contact.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("contact_click", "Footer LinkedIn")}
                className="h-[2.375rem] px-3 sm:px-4 rounded-(--radius-control) bg-(--bg-surface) border border-(--border-subtle) hover:border-brand/50 text-[0.6875rem] font-mono uppercase tracking-[0.14em] text-(--text-secondary) hover:text-(--text-primary) flex items-center justify-between sm:justify-center gap-2 transition-colors"
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Linkedin className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
                  <span>LinkedIn</span>
                </span>
                <ArrowUpRight className="w-3 h-3 text-(--text-muted) shrink-0" />
              </a>
            </Magnetic>

            <Magnetic strength={0.14} className="w-full sm:w-auto">
              <a
                href={`mailto:${profile.contact.email}`}
                onClick={() => trackEvent("contact_click", "Footer Email")}
                className="h-[2.375rem] px-3 sm:px-4 rounded-(--radius-control) bg-(--bg-surface) border border-(--border-subtle) hover:border-brand/50 text-[0.6875rem] font-mono uppercase tracking-[0.14em] text-(--text-secondary) hover:text-(--text-primary) flex items-center justify-between sm:justify-center gap-2 transition-colors"
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Mail className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
                  <span>Email</span>
                </span>
                <ArrowUpRight className="w-3 h-3 text-(--text-muted) shrink-0" />
              </a>
            </Magnetic>

            {showInstall && (
              <Magnetic strength={0.14} className="w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => void handleInstallClick()}
                  title="Install portfolio as an app"
                  className="w-full sm:w-auto h-[2.375rem] px-3 sm:px-4 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/40 hover:border-brand text-[0.6875rem] font-mono uppercase tracking-[0.14em] text-(--text-primary) flex items-center justify-between sm:justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <Download
                      className="w-3.5 h-3.5 text-(--text-accent) shrink-0"
                      aria-hidden="true"
                    />
                    <span>Install App</span>
                  </span>
                </button>
              </Magnetic>
            )}
          </div>
        </div>

        {/* Bottom Dock Row: Framed cleanly between the bottom-left LV Orb and bottom-right ScrollToTop */}
        <div className="pt-4 sm:pt-6 border-t border-(--border-subtle) px-12 sm:px-14 xl:px-0 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-center sm:text-left text-[0.6875rem] text-(--text-muted)">
          <p className="truncate max-w-full">
            © {currentYear} {profile.fullName}.
          </p>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2.5">
            {appearance.jumpscareEnabled &&
              (appearance.jumpscareTrigger || "secret-taps") === "secret-taps" && (
                <button
                  type="button"
                  onClick={() => dispatchJumpscareTrigger("secret-taps", true)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-brand/35 bg-(--bg-badge-highlight) text-[0.5625rem] font-mono uppercase tracking-wider text-(--text-accent) hover:border-brand cursor-pointer transition-colors"
                >
                  <Ghost className="w-2.5 h-2.5" aria-hidden="true" />
                  <span>Do Not Click</span>
                </button>
              )}
            <MonoLabel tone="muted" className="text-[0.5625rem] sm:text-[0.625rem]">
              All Rights Reserved · Class of {profile.education.graduationYear}
            </MonoLabel>
          </div>
        </div>
      </div>
    </footer>
  );
}
