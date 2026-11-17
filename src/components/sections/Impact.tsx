import { Metric, SectionHeaders } from "@/types/portfolio";
import { GitHubProofBar } from "@/components/sections/GitHubProofBar";
import {
  Eyebrow,
  DisplayHeading,
  BodyText,
} from "@/components/ui/Typography";

export interface ImpactProps {
  impactMetrics: Metric[];
  sectionHeaders: SectionHeaders;
}

export function Impact({ impactMetrics, sectionHeaders }: ImpactProps) {
  return (
    <section
      id="impact"
      aria-label="Impact Metrics"
      className="scroll-mt-16 w-full py-12 sm:py-24 lg:py-32 px-4 sm:px-6 md:px-10 border-b border-(--border-subtle) bg-(--bg-canvas)"
    >
      <div className="max-w-7xl mx-auto flex flex-col gap-8 sm:gap-16">
        {/* Header */}
        <div>
          <Eyebrow withDot className="mb-3">
            {sectionHeaders.impactEyebrow}
          </Eyebrow>
          <DisplayHeading as="h2" size="lg">
            {sectionHeaders.impactHeading}
          </DisplayHeading>
        </div>

        {/* 4-up Metrics Grid */}
        <div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-t border-(--border-subtle)">
            {impactMetrics.map((stat, i) => (
              <div
                key={stat.label}
                className={`impact-stat-cell flex flex-col justify-between py-6 sm:py-8 lg:py-10 border-b border-(--border-subtle) ${
                  i !== 0
                    ? "lg:border-l lg:border-(--border-subtle) lg:pl-6 xl:pl-8"
                    : ""
                } ${
                  i % 2 === 1
                    ? "sm:border-l sm:border-(--border-subtle) sm:pl-6 lg:pl-6 xl:pl-8"
                    : "sm:pr-6 lg:pr-4"
                } group`}
              >
                <dd className="font-display text-5xl sm:text-6xl xl:text-7xl uppercase tracking-tight text-(--text-primary) group-hover:text-(--text-accent) transition-colors duration-300">
                  {stat.prefix}
                  {stat.value}
                  <span className="text-(--text-accent)">
                    {stat.suffix}
                  </span>
                </dd>
                <dt className="mt-3 sm:mt-4">
                  <DisplayHeading as="span" size="sm" className="block">
                    {stat.label}
                  </DisplayHeading>
                  <BodyText size="xs" tone="secondary" className="mt-1 block">
                    {stat.description}
                  </BodyText>
                </dt>
              </div>
            ))}
          </dl>
        </div>

        <GitHubProofBar />
      </div>
    </section>
  );
}
