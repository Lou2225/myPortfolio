import { SkillCategory } from "@/types/portfolio";
import {
  Eyebrow,
  DisplayHeading,
  BodyText,
  TechBadge,
} from "@/components/ui/Typography";
import { cn } from "@/lib/utils";

interface BentoCardProps {
  category: SkillCategory;
  className?: string;
}

export function BentoCard({ category, className }: BentoCardProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between p-4 sm:p-6 md:p-8 rounded-(--radius-card) bg-(--bg-surface) border border-(--border-subtle) hover:border-(--border-strong) transition-colors duration-500 group shadow-lg overflow-hidden",
        className
      )}
    >
      {/* Background radial gradient accent */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-[radial-gradient(circle_at_top_right,var(--bg-badge-highlight)_0%,transparent_70%)] pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity duration-700" />

      <div>
        {/* Layer Eyebrow */}
        <Eyebrow className="mb-2">{category.eyebrow}</Eyebrow>

        {/* Category Title */}
        <DisplayHeading as="h3" size="md" hoverAccent>
          {category.title}
        </DisplayHeading>

        {/* Description */}
        <BodyText size="xs" tone="secondary" className="mt-2 max-w-sm">
          {category.description}
        </BodyText>
      </div>

      {/* Skills Pill List using reusable TechBadge */}
      <div className="mt-6 pt-6 border-t border-(--border-subtle) flex flex-wrap gap-2">
        {category.skills.map((skill) => (
          <TechBadge
            key={skill.name}
            label={skill.name}
            highlight={skill.highlight}
          />
        ))}
      </div>
    </div>
  );
}
