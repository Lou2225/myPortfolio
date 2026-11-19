import { SkillCategory } from "@/types/portfolio";
import {
  Eyebrow,
  DisplayHeading,
  BodyText,
} from "@/components/ui/Typography";
import { cn } from "@/lib/utils";

interface BentoCardProps {
  category: SkillCategory;
  index?: number;
  className?: string;
}

export function BentoCard({ category, index, className }: BentoCardProps) {
  const indexLabel =
    typeof index === "number" ? String(index + 1).padStart(2, "0") : null;

  return (
    <div
      className={cn(
        "relative h-full w-full flex flex-col justify-between p-4 sm:p-6 md:p-7 rounded-(--radius-card) bg-(--bg-surface) border border-(--border-subtle) hover:border-(--border-strong) transition-colors duration-500 group shadow-lg overflow-hidden",
        className
      )}
    >
      {/* Top hover specular hairline */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand/55 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
      />

      {/* Background radial gradient accent */}
      <div className="absolute top-0 right-0 w-44 h-44 bg-[radial-gradient(circle_at_top_right,var(--bg-badge-highlight)_0%,transparent_70%)] pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity duration-700" />

      {/* Subtle architectural index watermark */}
      {indexLabel && (
        <span
          aria-hidden="true"
          className="absolute top-3 right-4 sm:top-4 sm:right-6 font-display text-5xl sm:text-6xl leading-none tracking-tighter text-(--text-primary)/5 group-hover:text-brand/12 transition-colors duration-500 select-none pointer-events-none tabular-nums"
        >
          {indexLabel}
        </span>
      )}

      <div className="relative z-10 pr-10 sm:pr-14">
        {/* Layer Eyebrow */}
        <Eyebrow className="mb-2">{category.eyebrow}</Eyebrow>

        {/* Category Title */}
        <DisplayHeading as="h3" size="md" hoverAccent>
          {category.title}
        </DisplayHeading>

        {/* Description */}
        <BodyText size="xs" tone="secondary" className="mt-2 max-w-lg">
          {category.description}
        </BodyText>
      </div>

      {/* Structured Skills Grid surfacing both skill names & proficiency level */}
      <div className="relative z-10 mt-5 pt-5 border-t border-(--border-subtle) grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
        {category.skills.map((skill) => (
          <div
            key={skill.name}
            title={skill.level ? `${skill.name} — ${skill.level}` : skill.name}
            className={cn(
              "inline-flex items-center justify-between gap-2 px-3 py-2 rounded-(--radius-control) border transition-colors duration-300 min-w-0",
              skill.highlight
                ? "bg-(--bg-badge-highlight) border-brand/45 text-(--text-accent)"
                : "bg-(--bg-surface-2) border-(--border-subtle) text-(--text-secondary) group-hover:border-(--border-strong)"
            )}
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              {skill.highlight && (
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full bg-brand shrink-0"
                />
              )}
              <span
                className={cn(
                  "text-[0.75rem] leading-tight truncate",
                  skill.highlight
                    ? "font-semibold text-(--text-primary)"
                    : "font-medium text-(--text-primary)/90"
                )}
              >
                {skill.name}
              </span>
            </span>

            {skill.level && (
              <span
                className={cn(
                  "text-[0.5625rem] font-mono uppercase tracking-[0.14em] shrink-0",
                  skill.highlight
                    ? "text-(--text-accent) font-semibold"
                    : "text-(--text-muted)"
                )}
              >
                {skill.level}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
