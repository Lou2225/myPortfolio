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
    return <div ref={sentinelRef} aria-hidden="true" className="hidden" />;
  }

  return (
    <div
      aria-label="Live GitHub Engineering Metrics"
      className="rounded-(--radius-card) border border-(--border-subtle) bg-(--bg-surface) px-5 py-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-(--bg-badge-highlight) border border-brand/35 flex items-center justify-center text-(--text-accent)">
            <FolderGit2 className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <div className="text-xs font-mono">
            <span className="text-(--text-muted) uppercase tracking-wider text-[10px] block">
              Live GitHub Activity
            </span>
            <span className="text-(--text-primary) font-semibold">
              @{snapshot.username}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <span className="inline-flex items-center gap-1.5 text-(--text-secondary)">
            <Code2 className="w-3.5 h-3.5 text-(--text-accent)" aria-hidden="true" />
            <strong className="text-(--text-primary) tabular-nums">
              {snapshot.publicRepos}
            </strong>{" "}
            Repos
          </span>
          <span className="inline-flex items-center gap-1.5 text-(--text-secondary)">
            <Star className="w-3.5 h-3.5 text-(--text-accent)" aria-hidden="true" />
            <strong className="text-(--text-primary) tabular-nums">
              {snapshot.totalStars}
            </strong>{" "}
            Stars
          </span>
          <span className="inline-flex items-center gap-1.5 text-(--text-secondary)">
            <Users className="w-3.5 h-3.5 text-(--text-accent)" aria-hidden="true" />
            <strong className="text-(--text-primary) tabular-nums">
              {snapshot.followers}
            </strong>{" "}
            Followers
          </span>
        </div>

        {snapshot.topLanguages.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {snapshot.topLanguages.slice(0, 4).map((lang) => (
              <span
                key={lang.name}
                className="px-2 py-0.5 rounded-full bg-(--bg-surface-2) border border-(--border-subtle) text-[10px] font-mono text-(--text-secondary)"
              >
                {lang.name}{" "}
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
          className="h-8.5 px-3.5 text-xs font-mono shrink-0 self-start lg:self-center"
        >
          <span>GitHub Profile</span>
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
