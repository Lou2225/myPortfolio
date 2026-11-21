"use client";

import { useEffect, useRef, useState } from "react";
import { Code2, ExternalLink, FolderGit2, Star, Users } from "lucide-react";
import type { GitHubSnapshot } from "@/lib/github";
import { Button } from "@/components/ui/Button";

/**
 * Displays live ISR-cached GitHub repository, star, and top language proof
 * inside the Impact section when `GITHUB_USERNAME` or a profile GitHub handle is active.
 */
export function GitHubProofBar() {
  const [snapshot, setSnapshot] = useState<GitHubSnapshot | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let started = false;
    let observer: IntersectionObserver | null = null;
    let timerId: number | null = null;

    const loadSnapshot = () => {
      if (cancelled || started) return;
      started = true;
      observer?.disconnect();
      if (timerId !== null) window.clearTimeout(timerId);

      fetch("/api/github")
        .then((res) => (res.ok ? (res.json() as Promise<GitHubSnapshot>) : null))
        .then((data) => {
          if (!cancelled && data && data.configured) {
            setSnapshot(data);
          }
        })
        .catch(() => {
          // Non-blocking enrichment; fail silently if offline
        });
    };

    const el = sentinelRef.current;
    if (el && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            loadSnapshot();
          }
        },
        { rootMargin: "350px 0px", threshold: 0.01 }
      );
      observer.observe(el);
    }

    timerId = window.setTimeout(loadSnapshot, 3500);

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, []);

  if (!snapshot || !snapshot.configured || !snapshot.username) {
    return (
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="h-px w-full pointer-events-none opacity-0"
      />
    );
  }

  return (
    <div
      aria-label="Live GitHub Engineering Metrics"
      className="w-full rounded-(--radius-card) border border-(--border-subtle) bg-(--bg-surface) p-4 sm:px-6 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
    >
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3.5 sm:gap-x-6 sm:gap-y-2.5 flex-1 min-w-0">
        <div className="flex items-center justify-between sm:justify-start gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-(--bg-badge-highlight) border border-brand/35 flex items-center justify-center text-(--text-accent) shrink-0">
              <FolderGit2 className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
            <div className="text-[0.75rem] font-mono">
              <span className="text-(--text-muted) uppercase tracking-wider text-[0.625rem] block">
                Live GitHub Activity
              </span>
              <span className="text-(--text-primary) font-semibold">
                @{snapshot.username}
              </span>
            </div>
          </div>

          {snapshot.profileUrl && (
            <Button
              href={snapshot.profileUrl}
              external
              variant="outline"
              size="sm"
              magnetic={false}
              className="sm:hidden h-8 px-3 text-[0.6875rem] font-mono shrink-0"
            >
              <span>Profile</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-2 sm:gap-4 text-[0.75rem] font-mono py-2.5 sm:py-0 border-y sm:border-y-0 border-(--border-subtle) w-full sm:w-auto">
          <span className="inline-flex items-center justify-center sm:justify-start gap-1.5 text-(--text-secondary)">
            <Code2 className="w-3.5 h-3.5 text-(--text-accent) shrink-0" aria-hidden="true" />
            <strong className="text-(--text-primary) tabular-nums">
              {snapshot.publicRepos}
            </strong>{" "}
            <span>Repos</span>
          </span>
          <span className="inline-flex items-center justify-center sm:justify-start gap-1.5 text-(--text-secondary)">
            <Star className="w-3.5 h-3.5 text-(--text-accent) shrink-0" aria-hidden="true" />
            <strong className="text-(--text-primary) tabular-nums">
              {snapshot.totalStars}
            </strong>{" "}
            <span>Stars</span>
          </span>
          <span className="inline-flex items-center justify-center sm:justify-start gap-1.5 text-(--text-secondary)">
            <Users className="w-3.5 h-3.5 text-(--text-accent) shrink-0" aria-hidden="true" />
            <strong className="text-(--text-primary) tabular-nums">
              {snapshot.followers}
            </strong>{" "}
            <span>Followers</span>
          </span>
        </div>

        {snapshot.topLanguages.length > 0 && (
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {snapshot.topLanguages.slice(0, 4).map((lang) => (
              <span
                key={lang.name}
                className="h-7 px-2.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) text-[0.6875rem] font-mono text-(--text-secondary) inline-flex items-center justify-between sm:justify-center gap-1.5 whitespace-nowrap"
              >
                <span className="truncate">{lang.name}</span>
                <span className="text-(--text-muted) tabular-nums">
                  {lang.pct}%
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {snapshot.profileUrl && (
        <Button
          href={snapshot.profileUrl}
          external
          variant="outline"
          size="sm"
          magnetic={false}
          className="hidden sm:inline-flex h-8.5 px-3.5 text-[0.75rem] font-mono shrink-0 self-center"
        >
          <span>GitHub Profile</span>
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
