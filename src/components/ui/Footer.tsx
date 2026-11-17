"use client";

import { usePathname } from "next/navigation";
import { usePortfolio } from "@/context/PortfolioContext";
import { useOfflineStatus } from "@/components/pwa/OfflineManager";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import { Magnetic } from "@/components/motion/Magnetic";
import { Button } from "@/components/ui/Button";
import { DisplayHeading, MonoLabel } from "@/components/ui/Typography";
import { Download, Github, Linkedin, Mail } from "lucide-react";

export function Footer() {
  const { profile, sectionHeaders, trackEvent } = usePortfolio();
  const { isOnline, canInstall, promptInstall } = useOfflineStatus();
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();

  if (pathname?.startsWith("/admin")) return null;

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
    <footer className="lou-public-footer w-full border-t border-(--border-subtle) bg-(--bg-canvas) py-12 sm:py-16 px-4 sm:px-6 md:px-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-10 sm:gap-12">
        {/* Top footer row: Signature & Socials */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-8">
          <div>
            <DisplayHeading as="span" size="md" className="block">
              {profile.fullName}
            </DisplayHeading>
            <MonoLabel as="p" tone="muted" className="mt-2">
              {sectionHeaders.footerTagline}
            </MonoLabel>
          </div>

          {/* Social Links */}
          <div className="flex flex-wrap items-center gap-5 sm:gap-6 text-xs uppercase tracking-[0.18em]">
            <Magnetic strength={0.16}>
              <a
                href={profile.contact.github}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("contact_click", "Footer GitHub")}
                className="flex items-center gap-1.5 text-(--text-secondary) hover:text-(--text-accent) transition-colors"
              >
                <Github className="w-4 h-4" />
                <span>GitHub</span>
              </a>
            </Magnetic>
            <Magnetic strength={0.16}>
              <a
                href={profile.contact.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("contact_click", "Footer LinkedIn")}
                className="flex items-center gap-1.5 text-(--text-secondary) hover:text-(--text-accent) transition-colors"
              >
                <Linkedin className="w-4 h-4" />
                <span>LinkedIn</span>
              </a>
            </Magnetic>
            <Magnetic strength={0.16}>
              <a
                href={`mailto:${profile.contact.email}`}
                onClick={() => trackEvent("contact_click", "Footer Email")}
                className="flex items-center gap-1.5 text-(--text-secondary) hover:text-(--text-accent) transition-colors"
              >
                <Mail className="w-4 h-4" />
                <span>Email</span>
              </a>
            </Magnetic>
            {isOnline && canInstall && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleInstallClick()}
                title="Install portfolio as an app"
                className="shadow-(--shadow-card)"
              >
                <Download
                  className="w-3.5 h-3.5 text-(--text-accent)"
                  aria-hidden="true"
                />
                <span>Install App</span>
              </Button>
            )}
          </div>
        </div>

        {/* Bottom footer row: Copyright & Status */}
        <div className="pt-6 sm:pt-8 border-t border-(--border-subtle) flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-(--text-muted)">
          <p>
            © {currentYear} {profile.fullName}. All rights reserved.
          </p>
          <span className="flex items-center gap-1.5 text-(--text-success) font-medium">
            <span className="w-2 h-2 rounded-full bg-(--text-success) animate-pulse shrink-0" />
            <span>{profile.contact.status}</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
