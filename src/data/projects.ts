import { Project } from "@/types/portfolio";

export const projectsData: Project[] = [
  {
    id: "capstone-system",
    title: "Enterprise Group Capstone System",
    category: "Full-Stack System",
    year: "2025–2026",
    role: "Lead Full-Stack Developer (100% DB, API & UI)",
    outcome: "Production Capstone System",
    description:
      "An end-to-end web system architected from scratch to automate complex operational workflows, user authentication, and data records management.",
    problem:
      "Manual processes and disconnected spreadsheets caused high error rates and severe delays in record processing for the team.",
    solution:
      "Engineered a relational database schema, secured RESTful APIs with role-based access control, and built a responsive dashboard with real-time feedback.",
    stack: ["MySQL", "Node.js", "Express", "React", "Tailwind CSS", "REST APIs"],
    image: "/images/projects/capstone.webp",
    metrics:
      "Reduced record processing time by 65% with 100% data integrity across relational tables.",
    githubUrl: "https://github.com",
    liveUrl: "https://demo.vercel.app",
    featured: true,
    published: true,
  },
  {
    id: "business-analytics-dashboard",
    title: "Predictive Business Analytics Intelligence Hub",
    category: "Business Analytics",
    year: "2025",
    role: "Data & Analytics Developer",
    outcome: "Academic Excellence Showcase",
    description:
      "Interactive data visualization and statistical analytics platform translating high-volume raw records into actionable executive decisions.",
    problem:
      "Decision-makers lacked real-time visibility into historical trends, seasonal metrics, and key performance indicators.",
    solution:
      "Built data cleaning and aggregation pipelines, connected SQL query engines, and rendered interactive charts with dynamic filters and forecasts.",
    stack: ["Python", "Pandas", "PostgreSQL", "Next.js", "Chart.js", "Tailwind CSS"],
    image: "/images/projects/analytics.webp",
    metrics:
      "Aggregated 10,000+ data rows with sub-second chart rendering and automated KPI reporting.",
    githubUrl: "https://github.com",
    liveUrl: "https://demo.vercel.app",
    featured: true,
    published: true,
  },
  {
    id: "cinematic-web-app",
    title: "High-Performance Modern Web Platform",
    category: "Web Application",
    year: "2026",
    role: "Frontend & Systems Engineer",
    outcome: "Featured Technical Portfolio",
    description:
      "A cinematic, hardware-accelerated web application featuring Lenis momentum scrolling, GSAP choreography, and modular TypeScript components.",
    problem:
      "Standard template websites suffer from frame drops, bloated bundles, and generic visual layouts.",
    solution:
      "Crafted GPU-composite transforms, zero-lag animation loops, and fluid proportional typography targeting a 98+ Lighthouse score.",
    stack: ["Next.js", "TypeScript", "Tailwind CSS", "GSAP", "Lenis", "Zod"],
    image: "/images/projects/portfolio.webp",
    metrics:
      "Maintains solid 60–120 FPS on all viewports with sub-800ms First Contentful Paint.",
    githubUrl: "https://github.com",
    liveUrl: "https://loudiamond-valdellon.vercel.app",
    featured: true,
    published: true,
  },
];
