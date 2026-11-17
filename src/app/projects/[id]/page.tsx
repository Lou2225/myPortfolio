import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPortfolioContent } from "@/lib/db";
import { ProjectCaseStudyView } from "@/components/projects/ProjectCaseStudyView";

export const dynamic = "force-dynamic";

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

function resolvePublishedProject(
  projects: Awaited<ReturnType<typeof getPortfolioContent>>["projects"],
  rawId: string
) {
  let decodedId = rawId;
  try {
    decodedId = decodeURIComponent(rawId);
  } catch {
    decodedId = rawId;
  }
  const published = projects.filter((p) => p.published !== false);
  const index = published.findIndex(
    (p) => p.id === decodedId || p.id === rawId
  );
  if (index < 0) return null;

  const project = published[index];
  const prevProject =
    published.length > 1
      ? published[(index - 1 + published.length) % published.length]
      : null;
  const nextProject =
    published.length > 1 ? published[(index + 1) % published.length] : null;

  return { project, prevProject, nextProject };
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { id } = await params;
  const db = await getPortfolioContent();
  const resolved = resolvePublishedProject(db.projects, id);

  if (!resolved) {
    return {
      title: "Project Not Found",
      robots: { index: false, follow: false },
    };
  }

  const { project } = resolved;
  const shortTitle = `${db.profile.name || "Lou Diamond"} ${db.profile.lastName || "Valdellon"}`;
  const title = `${project.title} — ${shortTitle}`;
  const description = project.description || project.outcome;

  return {
    title,
    description,
    keywords: [project.title, project.category, ...project.stack],
    alternates: {
      canonical: `/projects/${encodeURIComponent(project.id)}`,
    },
    openGraph: {
      title,
      description,
      url: `/projects/${encodeURIComponent(project.id)}`,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ProjectCaseStudyPage({
  params,
}: ProjectPageProps) {
  const { id } = await params;
  const db = await getPortfolioContent();
  const resolved = resolvePublishedProject(db.projects, id);

  if (!resolved) {
    notFound();
  }

  return (
    <ProjectCaseStudyView
      project={resolved.project}
      prevProject={resolved.prevProject}
      nextProject={resolved.nextProject}
    />
  );
}
