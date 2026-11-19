"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePortfolio } from "@/context/PortfolioContext";
import { Magnetic } from "@/components/motion/Magnetic";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { MonogramBadge } from "@/components/common/MonogramBadge";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { dispatchJumpscareTrigger } from "@/lib/jumpscare";
import { ArrowUpRight, Menu, X } from "lucide-react";

interface NavItem {
  id: string;
  chapter: string;
  label: string;
  href: string;
}

const navLinks: NavItem[] = [
  { id: "top", chapter: "00", label: "Intro", href: "#top" },
  { id: "story", chapter: "01", label: "Story", href: "#story" },
  { id: "skills", chapter: "02", label: "Skills", href: "#skills" },
  { id: "projects", chapter: "03", label: "Projects", href: "#projects" },
  { id: "impact", chapter: "04", label: "Impact", href: "#impact" },
  { id: "contact", chapter: "05", label: "Contact", href: "#contact" },
];

export function Navbar() {
  const { profile, appearance, trackEvent } = usePortfolio();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("top");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const seenChaptersRef = useRef<Set<string>>(new Set(["top"]));
  const { scrollTo } = useSmoothScroll();

  const isAdminRoute = pathname?.startsWith("/admin");
  const isHomeRoute = pathname === "/";
  const isOfflineRoute = pathname === "/offline";
  const isProjectRoute = Boolean(pathname?.startsWith("/projects/"));

  const interceptContactScare = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (
        !isOfflineRoute &&
        appearance.jumpscareEnabled &&
        appearance.jumpscareTrigger === "get-in-touch"
      ) {
        e.preventDefault();
        e.stopPropagation();
        dispatchJumpscareTrigger("get-in-touch", true);
        return true;
      }
      return false;
    },
    [isOfflineRoute, appearance.jumpscareEnabled, appearance.jumpscareTrigger]
  );

  const updateScrollState = useCallback(() => {
    if (isAdminRoute) return;

    const scrollY = window.scrollY;
    setScrolled(scrollY > 24);

    if (isHomeRoute && scrollY <= 24) {
      setActiveSection("top");
    }
  }, [isAdminRoute, isHomeRoute]);

  useEffect(() => {
    if (isAdminRoute) return;

    let observer: IntersectionObserver | null = null;

    const attachSectionObserver = () => {
      if (observer || !isHomeRoute || typeof IntersectionObserver === "undefined") {
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          if (window.scrollY <= 24) return;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const id = entry.target.id;
            if (!id) continue;
            setActiveSection(id);
            if (!seenChaptersRef.current.has(id)) {
              seenChaptersRef.current.add(id);
              const found = navLinks.find((n) => n.id === id);
              if (found) {
                trackEvent("chapter_view", `${found.chapter} ${found.label}`);
              }
            }
          }
        },
        { rootMargin: "-35% 0px -50% 0px", threshold: 0.01 }
      );

      for (const item of navLinks) {
        const el = document.getElementById(item.id);
        if (el) observer.observe(el);
      }
    };

    const handleScroll = () => {
      updateScrollState();
      if (window.scrollY > 24) {
        attachSectionObserver();
      }
    };

    let rafId = 0;
    const hashTimerId = window.location.hash
      ? window.setTimeout(() => {
          rafId = requestAnimationFrame(() => {
            if (window.scrollY > 0) handleScroll();
          });
        }, 120)
      : 0;
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (hashTimerId) window.clearTimeout(hashTimerId);
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, [isAdminRoute, isHomeRoute, updateScrollState, trackEvent]);

  if (isAdminRoute) return null;

  const resolveItemHref = (item: NavItem) =>
    isHomeRoute ? item.href : `/${item.href}`;

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    item: NavItem
  ) => {
    setMobileMenuOpen(false);
    if (!isHomeRoute) return;

    e.preventDefault();
    setActiveSection(item.id);
    scrollTo(item.href, {
      offset: item.id === "top" ? 0 : -76,
      duration: 1.4,
    });
    if (window.history.pushState) {
      window.history.pushState(null, "", item.href);
    }
  };

  const currentSection = isHomeRoute
    ? activeSection
    : isProjectRoute
      ? "projects"
      : "";
  const activeItem =
    navLinks.find((item) => item.id === currentSection) || navLinks[0];
  const contactHref = isHomeRoute ? "#contact" : "/#contact";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 w-full max-w-full overflow-x-clip transition-[background-color,padding,box-shadow] duration-500 ${
          scrolled
            ? "navbar-scrolled bg-[#08080a]/85 backdrop-blur-xl py-2.5 sm:py-3.5 shadow-lg"
            : "navbar-top bg-linear-to-b from-[#08080a]/90 via-[#08080a]/40 to-transparent py-3.5 sm:py-5"
        }`}
      >
        <nav
          aria-label="Main Storytelling Navigation"
          className="max-w-7xl mx-auto w-full px-(--gutter) flex items-center justify-between gap-2 sm:gap-4"
        >
          {/* Brand Logo & Monogram */}
          <Magnetic strength={0.18} className="min-w-0">
            <Link
              href={isHomeRoute ? "#top" : "/"}
              onClick={(e) => handleNavClick(e, navLinks[0])}
              className="flex items-center gap-2 sm:gap-3 group select-none cursor-pointer min-w-0"
            >
              <MonogramBadge
                monogram={profile.monogram}
                imageUrl={profile.monogramImageUrl}
                transform={profile.monogramTransform}
                alt={`${profile.name} monogram logo`}
                loading="eager"
                className={`w-[2rem] h-[2rem] sm:w-[2.5rem] sm:h-[2.5rem] rounded-full border font-bold text-[0.75rem] tracking-wider transition-all duration-300 shrink-0 ${
                  currentSection === "top"
                    ? "border-brand text-(--text-accent) bg-(--bg-badge-highlight) shadow-[0_0_15px_var(--accent-glow)]"
                    : "border-(--border-strong) text-(--text-primary) group-hover:border-brand group-hover:text-(--text-accent)"
                }`}
              />
              <div className="flex flex-col min-w-0 max-w-[7.25rem] min-[420px]:max-w-[9.5rem] sm:max-w-none">
                <span className="text-[0.6875rem] sm:text-[0.75rem] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] text-(--text-primary) group-hover:text-(--text-accent) transition-colors leading-tight truncate">
                  {profile.name}
                </span>
                <span className="text-[0.53125rem] sm:text-[0.625rem] uppercase tracking-[0.11em] sm:tracking-[0.14em] text-(--text-muted) leading-tight truncate">
                  {profile.education.major}
                </span>
              </div>
            </Link>
          </Magnetic>

          {/* Desktop & Tablet Storytelling Chapter Tabs (hidden on /offline) */}
          {!isOfflineRoute && (
            <ul className="hidden lg:flex items-center gap-6 xl:gap-8">
              {navLinks.map((link) => {
                const isActive = currentSection === link.id;
                return (
                  <li key={link.id}>
                    <Magnetic strength={0.14}>
                      <Link
                        href={resolveItemHref(link)}
                        onClick={(e) => handleNavClick(e, link)}
                        aria-current={isActive ? "page" : undefined}
                        className={`relative flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] py-2 transition-colors duration-300 group ${
                          isActive
                            ? "text-(--text-primary) font-semibold"
                            : "text-(--text-secondary) hover:text-(--text-primary)"
                        }`}
                      >
                        <span
                          className={`font-mono text-[10px] transition-colors duration-300 ${
                            isActive
                              ? "text-(--text-accent) font-bold"
                              : "text-(--text-muted) group-hover:text-(--text-accent)"
                          }`}
                        >
                          {link.chapter}
                        </span>
                        <span>{link.label}</span>

                        {/* Active & Hover Underline Indicator (GPU scaleX transform) */}
                        <span
                          className={`absolute bottom-0 left-0 right-0 h-0.5 bg-brand origin-left transition-transform duration-500 ease-out ${
                            isActive
                              ? "scale-x-100 shadow-[0_0_10px_var(--accent)]"
                              : "scale-x-0 group-hover:scale-x-100 opacity-60"
                          }`}
                        />
                      </Link>
                    </Magnetic>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Right Action & Mobile Active Chapter Indicator */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {!isOfflineRoute && (
              <div className="flex lg:hidden items-center gap-1.5 px-2 sm:px-2.5 h-[1.75rem] sm:h-[1.875rem] rounded-full bg-(--bg-surface) border border-(--border-subtle) text-[0.5625rem] sm:text-[0.625rem] uppercase tracking-[0.11em] sm:tracking-[0.14em] whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                <span className="font-mono text-(--text-accent) font-bold">
                  {activeItem.chapter}
                </span>
                <span className="hidden min-[360px]:inline text-(--text-primary) font-medium">
                  {activeItem.label}
                </span>
              </div>
            )}

            {/* Dark / Light Mode Toggle Icon */}
            <ThemeToggle />

            <div className={isOfflineRoute ? "block" : "hidden sm:block"}>
              <Button
                href={isOfflineRoute ? "/" : contactHref}
                variant="outline"
                size="sm"
                onClick={interceptContactScare}
                className="gap-1.5"
              >
                <span>
                  {isOfflineRoute ? "Cached Portfolio" : "Get In Touch"}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-(--text-accent)" />
              </Button>
            </div>

            {!isOfflineRoute && (
              <div className="lg:hidden">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                  aria-expanded={mobileMenuOpen}
                >
                  {mobileMenuOpen ? (
                    <X className="w-4 h-4 text-(--text-accent)" />
                  ) : (
                    <Menu className="w-4 h-4" />
                  )}
                </Button>
              </div>
            )}
          </div>
        </nav>
      </header>

      {/* Mobile / Tablet Drawer Navigation */}
      {!isOfflineRoute && (
        <div
          aria-hidden={!mobileMenuOpen}
          inert={!mobileMenuOpen || undefined}
          className={`fixed inset-0 z-40 bg-(--bg-canvas)/98 flex flex-col justify-between px-6 sm:px-10 pt-24 pb-10 lg:hidden transition-all duration-500 ${
            mobileMenuOpen
              ? "opacity-100 translate-y-0 pointer-events-auto backdrop-blur-2xl visible"
              : "opacity-0 -translate-y-full pointer-events-none invisible"
          }`}
        >
          <div className="my-auto">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-(--text-accent) mb-4">
              Story Chapters
            </p>
            <ul className="flex flex-col divide-y divide-(--border-subtle) border-y border-(--border-subtle)">
              {navLinks.map((link) => {
                const isActive = currentSection === link.id;
                return (
                  <li key={link.id}>
                    <Link
                      href={resolveItemHref(link)}
                      onClick={(e) => handleNavClick(e, link)}
                      className={`py-3.5 sm:py-4 font-display text-3xl sm:text-4xl uppercase tracking-tight transition-colors flex items-center justify-between ${
                        isActive
                          ? "text-(--text-accent)"
                          : "text-(--text-primary) hover:text-(--text-accent)"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-brand" />
                        )}
                        <span>{link.label}</span>
                      </span>
                      <span
                        className={`text-xs font-mono tracking-[0.2em] ${
                          isActive
                            ? "text-(--text-accent)"
                            : "text-(--text-muted)"
                        }`}
                      >
                        CH // {link.chapter}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="pt-6 flex flex-col gap-3">
            <Button
              href={contactHref}
              variant="primary"
              size="lg"
              fullWidth
              onClick={(e) => {
                setMobileMenuOpen(false);
                interceptContactScare(e);
              }}
              className="text-center"
            >
              Contact {profile.name}
            </Button>
            <p className="text-[11px] uppercase tracking-[0.18em] text-center text-(--text-muted)">
              {profile.contact.status}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
