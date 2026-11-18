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
      className="scroll-mt-20 w-full py-(--section-py) px-(--gutter) border-b border-(--border-subtle) bg-(--bg-canvas)"
    >
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-7 sm:gap-12 lg:gap-16">
        {/* Left Column: Origin Narrative */}
        <div className="lg:col-span-5 flex flex-col justify-start">
          <Eyebrow withDot className="mb-2.5 sm:mb-3">
            {sectionHeaders.storyEyebrow}
          </Eyebrow>

          <DisplayHeading as="h2" size="lg">
            {profile.storyHeading}
          </DisplayHeading>

          <div className="mt-4 sm:mt-7 space-y-3.5 sm:space-y-4">
            {profile.storyBody.map((paragraph, i) => (
              <BodyText key={i} size="md" tone="secondary">
                {paragraph}
              </BodyText>
            ))}
          </div>

          <div className="mt-5 sm:mt-8 py-3.5 sm:py-5 border-y border-(--border-subtle) grid grid-cols-3 divide-x divide-(--border-subtle) w-full text-center">
            <div className="px-2">
              <DisplayHeading as="span" size="sm" className="block">
                {displayAge}
              </DisplayHeading>
              <MonoLabel tone="muted" className="block mt-0.5">
                Age
              </MonoLabel>
            </div>
            <div className="px-2">
              <DisplayHeading as="span" size="sm" className="block">
                {profile.education.graduationYear}
              </DisplayHeading>
              <MonoLabel tone="muted" className="block mt-0.5">
                Graduating
              </MonoLabel>
            </div>
            <div className="px-2">
              <DisplayHeading
                as="span"
                size="sm"
                tone="accent"
                className="block"
              >
                Full-Stack
              </DisplayHeading>
              <MonoLabel tone="muted" className="block mt-0.5">
                Focus
              </MonoLabel>
            </div>
          </div>
        </div>

        {/* Right Column: Core Pillars */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <ul className="divide-y divide-(--border-subtle) border-y border-(--border-subtle) w-full">
            {pillars.map((pillar) => (
              <li
                key={pillar.number}
                className="story-pillar-item py-4 sm:py-7 flex flex-row items-baseline gap-3.5 sm:gap-7 group px-1 sm:px-4 transition-colors duration-300 rounded-sm"
              >
                <DisplayHeading
                  as="span"
                  size="sm"
                  tone="accent"
                  className="tabular-nums shrink-0"
                >
                  {pillar.number}
                </DisplayHeading>
                <div className="min-w-0 flex-1">
                  <DisplayHeading as="h3" size="sm" hoverAccent>
                    {pillar.title}
                  </DisplayHeading>
                  <BodyText
                    size="sm"
                    tone="secondary"
                    className="mt-1.5 sm:mt-2 max-w-xl"
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
