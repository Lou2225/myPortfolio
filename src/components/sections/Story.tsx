import { Pillar, Profile, SectionHeaders } from "@/types/portfolio";
import { calculateAge } from "@/lib/date";
import {
  Eyebrow,
  DisplayHeading,
  BodyText,
  MonoLabel,
} from "@/components/ui/Typography";

export interface StoryProps {
  profile: Profile;
  pillars: Pillar[];
  sectionHeaders: SectionHeaders;
}

export function Story({ profile, pillars, sectionHeaders }: StoryProps) {
  const displayAge = calculateAge(profile.birthDate) ?? profile.age;

  return (
    <section
      id="story"
      aria-label="About and Origin Story"
      className="scroll-mt-16 w-full py-12 sm:py-24 lg:py-32 px-4 sm:px-6 md:px-10 border-b border-(--border-subtle) bg-(--bg-canvas)"
    >
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12 lg:gap-16">
        {/* Left Column: Origin Narrative */}
        <div className="lg:col-span-5 flex flex-col justify-start">
          <Eyebrow withDot className="mb-4">
            {sectionHeaders.storyEyebrow}
          </Eyebrow>

          <DisplayHeading as="h2" size="lg">
            {profile.storyHeading}
          </DisplayHeading>

          <div className="mt-6 sm:mt-8 space-y-4">
            {profile.storyBody.map((paragraph, i) => (
              <BodyText key={i} size="md" tone="secondary">
                {paragraph}
              </BodyText>
            ))}
          </div>

          <div className="mt-8 pt-6 sm:pt-8 border-t border-(--border-subtle) flex flex-wrap items-center gap-5 sm:gap-6">
            <div className="text-center">
              <DisplayHeading as="span" size="sm" className="block">
                {displayAge}
              </DisplayHeading>
              <MonoLabel tone="muted" className="block text-center">
                Age
              </MonoLabel>
            </div>
            <div className="w-px h-8 bg-(--border-subtle)" />
            <div>
              <DisplayHeading as="span" size="sm" className="block">
                {profile.education.graduationYear}
              </DisplayHeading>
              <MonoLabel tone="muted">Graduating</MonoLabel>
            </div>
            <div className="w-px h-8 bg-(--border-subtle)" />
            <div>
              <DisplayHeading
                as="span"
                size="sm"
                tone="accent"
                className="block"
              >
                Full-Stack
              </DisplayHeading>
              <MonoLabel tone="muted">Focus</MonoLabel>
            </div>
          </div>
        </div>

        {/* Right Column: Core Pillars */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <ul className="divide-y divide-(--border-subtle) border-y border-(--border-subtle)">
            {pillars.map((pillar) => (
              <li
                key={pillar.number}
                className="story-pillar-item py-6 sm:py-8 flex flex-col sm:flex-row sm:items-baseline gap-3 sm:gap-8 group px-3 sm:px-4 -mx-3 sm:-mx-4 transition-colors duration-300 rounded-sm"
              >
                <DisplayHeading
                  as="span"
                  size="sm"
                  tone="accent"
                  className="tabular-nums shrink-0"
                >
                  {pillar.number}
                </DisplayHeading>
                <div>
                  <DisplayHeading as="h3" size="sm" hoverAccent>
                    {pillar.title}
                  </DisplayHeading>
                  <BodyText
                    size="sm"
                    tone="secondary"
                    className="mt-2 max-w-xl"
                  >
                    {pillar.description}
                  </BodyText>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
