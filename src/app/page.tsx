import { Hero } from "@/components/sections/Hero";
import { Marquee } from "@/components/sections/Marquee";
import { Story } from "@/components/sections/Story";
import { TechBento } from "@/components/sections/TechBento";
import { Impact } from "@/components/sections/Impact";
import {
  DeferredProjects,
  DeferredContact,
} from "@/components/sections/DeferredSections";
import { StarfieldCanvas } from "@/components/motion/StarfieldCanvas";
import { getPortfolioContent } from "@/lib/db";
import { getSiteOrigin } from "@/lib/siteUrl";

export default async function Home() {
  const db = await getPortfolioContent();
  const origin = getSiteOrigin();
  const sameAs = [db.profile.contact.github, db.profile.contact.linkedin]
    .map((url) => url?.trim())
    .filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url)));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: db.profile.fullName || "Lou Diamond Lava Valdellon",
    url: origin,
    jobTitle:
      db.profile.headline || "Full-Stack Developer & Business Analytics",
    description: db.profile.bio,
    email: db.profile.contact.email
      ? `mailto:${db.profile.contact.email}`
      : undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    knowsAbout: [
      ...db.profile.roles,
      ...db.skills.flatMap((cat) => cat.skills.map((skill) => skill.name)),
    ].slice(0, 18),
    alumniOf: {
      "@type": "EducationalOrganization",
      name: `${db.profile.education.degree} — ${db.profile.education.major}`,
    },
  };

  return (
    <main className="lou-public-root relative w-full overflow-x-hidden">
      <StarfieldCanvas />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <Hero />
      <Marquee
        marqueePrinciples={db.marqueePrinciples}
        marqueeSpeed={db.appearance.marqueeSpeed}
      />
      <Story
        profile={db.profile}
        pillars={db.pillars}
        sectionHeaders={db.sectionHeaders}
      />
      <TechBento
        skills={db.skills}
        sectionHeaders={db.sectionHeaders}
      />
      <DeferredProjects />
      <Impact
        impactMetrics={db.impactMetrics}
        sectionHeaders={db.sectionHeaders}
      />
      <DeferredContact />
    </main>
  );
}
