import { Metric, SectionHeaders } from "@/types/portfolio";
import { GitHubProofBar } from "@/components/sections/GitHubProofBar";
import { ScrollReveal } from "@/components/motion/ScrollReveal";
import { CountUpMetric } from "@/components/motion/CountUpMetric";
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
      className="relative z-10 scroll-mt-20 w-full py-(--section-py) px-(--gutter) border-b border-(--border-subtle) bg-(--bg-canvas)/74"
    >
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-6 sm:gap-12">
        {/* Header */}
        <ScrollReveal variant="fade-up">
          <Eyebrow withDot className="mb-2.5">
            {sectionHeaders.impactEyebrow}
          </Eyebrow>
          <DisplayHeading as="h2" size="lg">
            {sectionHeaders.impactHeading}
          </DisplayHeading>
        </ScrollReveal>

        {/* Uniform 2x2 Mobile / 4-Column Desktop Metrics Grid */}
        <div className="w-full">
          <dl className="grid grid-cols-2 lg:grid-cols-4 border-t border-(--border-subtle) w-full">
            {impactMetrics.map((stat, i) => (
              <ScrollReveal
                key={stat.label}
                variant="fade-up"
                delayMs={i * 75}
                className={`impact-stat-cell flex flex-col justify-between py-5 sm:py-8 lg:py-10 border-b border-(--border-subtle) ${
                  i !== 0
                    ? "lg:border-l lg:border-(--border-subtle) lg:pl-6 xl:pl-8"
                    : ""
                } ${
                  i % 2 === 1
                    ? "border-l border-(--border-subtle) pl-4 sm:pl-6 lg:pl-6 xl:pl-8"
                    : "pr-4 sm:pr-6 lg:pr-4"
                } group`}
              >
                <dd className="font-display text-[calc(clamp(2.125rem,1.35rem+3.4vw,4.5rem)*var(--public-scale,1))] leading-[0.95] uppercase tracking-tight text-(--text-primary) group-hover:text-(--text-accent) transition-colors duration-300 tabular-nums">
                  {stat.prefix}
                  <CountUpMetric value={stat.value} />
                  <span className="text-(--text-accent)">
                    {stat.suffix}
                  </span>
                </dd>
                <dt className="mt-2.5 sm:mt-4">
                  <DisplayHeading as="span" size="sm" className="block">
                    {stat.label}
                  </DisplayHeading>
                  <BodyText size="xs" tone="secondary" className="mt-1 block">
                    {stat.description}
                  </BodyText>
                </dt>
              </ScrollReveal>
            ))}
          </dl>
        </div>

        <ScrollReveal variant="fade-up" delayMs={140}>
          <GitHubProofBar />
        </ScrollReveal>
      </div>
    </section>
  );
}
