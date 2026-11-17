"use client";

import { useMemo, useState } from "react";
import { Layers, RotateCcw } from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";
import { ProjectCard } from "@/components/ui/ProjectCard";
import { Tabs, TabItem } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import {
  Eyebrow,
  DisplayHeading,
  MonoLabel,
  BodyText,
} from "@/components/ui/Typography";
import { cn } from "@/lib/utils";

const ALL_CATEGORY = "__all__";
const ALL_STACK = "__all_stack__";

export function Projects() {
  const { projects, sectionHeaders, appearance } = usePortfolio();
  const visibleProjects = useMemo(
    () => projects.filter((p) => p.published !== false),
    [projects]
  );

  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY);
  const [selectedStack, setSelectedStack] = useState<string>(ALL_STACK);

  const categoryItems = useMemo<TabItem<string>[]>(() => {
    const counts = new Map<string, number>();
    for (const proj of visibleProjects) {
      const cat = proj.category.trim();
      if (cat) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }

    const items: TabItem<string>[] = [
      {
        id: ALL_CATEGORY,
        label: "All Systems",
        badge: visibleProjects.length,
        badgeVariant: "neutral",
      },
    ];

    for (const [cat, count] of counts.entries()) {
      items.push({
        id: cat,
        label: cat,
        badge: count,
        badgeVariant: "neutral",
      });
    }

    return items;
  }, [visibleProjects]);

  const topStacks = useMemo(() => {
    const pool =
      selectedCategory === ALL_CATEGORY
        ? visibleProjects
        : visibleProjects.filter((p) => p.category.trim() === selectedCategory);

    const freq = new Map<string, number>();
    for (const proj of pool) {
      for (const tech of proj.stack) {
        const clean = tech.trim();
        if (clean) {
          freq.set(clean, (freq.get(clean) ?? 0) + 1);
        }
      }
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([name]) => name);
  }, [visibleProjects, selectedCategory]);

  const activeCategory = categoryItems.some((c) => c.id === selectedCategory)
    ? selectedCategory
    : ALL_CATEGORY;
  const activeStack =
    selectedStack === ALL_STACK || topStacks.includes(selectedStack)
      ? selectedStack
      : ALL_STACK;

  const filteredProjects = useMemo(
    () =>
      visibleProjects.filter((proj) => {
        if (
          activeCategory !== ALL_CATEGORY &&
          proj.category.trim() !== activeCategory
        ) {
          return false;
        }
        if (
          activeStack !== ALL_STACK &&
          !proj.stack.some(
            (tech) => tech.trim().toLowerCase() === activeStack.toLowerCase()
          )
        ) {
          return false;
        }
        return true;
      }),
    [visibleProjects, activeCategory, activeStack]
  );

  const staggered =
    appearance.projectsLayout !== "aligned" && filteredProjects.length >= 2;
  const hasFilters = categoryItems.length > 2 || topStacks.length > 1;
  const isFiltered =
    activeCategory !== ALL_CATEGORY || activeStack !== ALL_STACK;

  return (
    <section
      id="projects"
      aria-label="Selected Projects and Systems"
      className="scroll-mt-16 w-full py-12 sm:py-24 lg:py-32 px-4 sm:px-6 md:px-10 border-b border-(--border-subtle) bg-(--bg-canvas)"
    >
      <div className="max-w-7xl mx-auto flex flex-col gap-8 sm:gap-12">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
          <div>
            <Eyebrow withDot className="mb-3">
              {sectionHeaders.projectsEyebrow}
            </Eyebrow>
            <DisplayHeading as="h2" size="lg">
              {sectionHeaders.projectsHeading}
            </DisplayHeading>
          </div>

          <div className="flex items-center gap-2">
            <MonoLabel tone="accent">
              {String(filteredProjects.length).padStart(2, "0")}
            </MonoLabel>
            <MonoLabel tone="muted">
              / {sectionHeaders.projectsCounterLabel}
            </MonoLabel>
          </div>
        </div>

        {/* Category & Tech Stack Filters */}
        {hasFilters && (
          <div className="flex flex-col gap-3 pb-2 border-b border-(--border-subtle)">
            {categoryItems.length > 2 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs
                  items={categoryItems}
                  value={activeCategory}
                  onChange={(nextCat) => {
                    setSelectedCategory(nextCat);
                    setSelectedStack(ALL_STACK);
                  }}
                  ariaLabel="Filter projects by category"
                  variant="accent"
                  size="sm"
                />

                {isFiltered && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCategory(ALL_CATEGORY);
                      setSelectedStack(ALL_STACK);
                    }}
                    className="h-8 px-3 font-mono text-[11px] normal-case tracking-normal"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    <span>Reset Filters</span>
                  </Button>
                )}
              </div>
            )}

            {topStacks.length > 1 && (
              <div
                role="group"
                aria-label="Filter projects by technology stack"
                className="flex flex-wrap items-center gap-2"
              >
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted) mr-1">
                  <Layers className="w-3 h-3 text-(--text-accent)" aria-hidden="true" />
                  <span>Stack</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={activeStack === ALL_STACK ? "secondary" : "outline"}
                  onClick={() => setSelectedStack(ALL_STACK)}
                  aria-pressed={activeStack === ALL_STACK}
                  className={cn(
                    "h-7.5 px-3 text-[11px] font-mono",
                    activeStack === ALL_STACK &&
                      "bg-(--bg-badge-highlight) border-brand/50 text-(--text-accent)"
                  )}
                >
                  All
                </Button>
                {topStacks.map((tech) => {
                  const selected = activeStack === tech;
                  return (
                    <Button
                      key={tech}
                      type="button"
                      size="sm"
                      variant={selected ? "primary" : "outline"}
                      onClick={() =>
                        setSelectedStack(selected ? ALL_STACK : tech)
                      }
                      aria-pressed={selected}
                      className="h-7.5 px-3 text-[11px] font-mono"
                    >
                      {tech}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Projects Grid */}
        <div>
          {filteredProjects.length === 0 ? (
            <div className="p-10 rounded-(--radius-card) border border-(--border-subtle) bg-(--bg-surface) text-center space-y-4">
              <BodyText size="sm" tone="secondary">
                No published systems match the selected category and stack filter.
              </BodyText>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedCategory(ALL_CATEGORY);
                  setSelectedStack(ALL_STACK);
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Show All Projects</span>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12">
              {filteredProjects.map((project, idx) => (
                <div
                  key={project.id}
                  className={staggered && idx % 2 === 1 ? "lg:mt-16" : ""}
                >
                  <ProjectCard project={project} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
