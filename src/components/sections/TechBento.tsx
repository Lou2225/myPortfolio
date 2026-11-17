import { SectionHeaders, SkillCategory } from "@/types/portfolio";
import { BentoCard } from "@/components/ui/BentoCard";
import {
  Eyebrow,
  DisplayHeading,
  BodyText,
} from "@/components/ui/Typography";

export interface TechBentoProps {
  skills: SkillCategory[];
  sectionHeaders: SectionHeaders;
}

export function TechBento({ skills, sectionHeaders }: TechBentoProps) {
  return (
    <section
      id="skills"
      aria-label="Technical Skills and Architecture"
      className="scroll-mt-16 w-full py-12 sm:py-24 lg:py-32 px-4 sm:px-6 md:px-10 border-b border-(--border-subtle) bg-(--bg-canvas)"
    >
      <div className="max-w-7xl mx-auto flex flex-col gap-8 sm:gap-12">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
          <div>
            <Eyebrow withDot className="mb-3">
              {sectionHeaders.skillsEyebrow}
            </Eyebrow>
            <DisplayHeading as="h2" size="lg">
              {sectionHeaders.skillsHeading}
            </DisplayHeading>
          </div>
          <BodyText size="sm" tone="secondary" className="max-w-md">
            {sectionHeaders.skillsSubtitle}
          </BodyText>
        </div>

        {/* 4-Layer Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {skills.map((category) => (
            <div key={category.id} className="bento-card-item flex">
              <BentoCard category={category} className="w-full" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
