import { SkillCategory } from "@/types/portfolio";

export const skillsData: SkillCategory[] = [
  {
    id: "database",
    title: "Database & Data Architecture",
    eyebrow: "Layer 01 / Foundation",
    description: "Designing normalized relational schemas, query optimization, and reliable transaction pipelines.",
    skills: [
      { name: "MySQL", level: "Advanced", highlight: true },
      { name: "PostgreSQL", level: "Proficient", highlight: true },
      { name: "Database Normalization (3NF)", level: "Advanced" },
      { name: "Schema Design & Relational Modeling", level: "Advanced" },
      { name: "SQL Query Optimization", level: "Proficient" },
    ],
  },
  {
    id: "backend",
    title: "Backend & Systems Logic",
    eyebrow: "Layer 02 / Core Logic",
    description: "Developing resilient RESTful APIs, authentication middleware, and robust business logic.",
    skills: [
      { name: "Node.js", level: "Advanced", highlight: true },
      { name: "Express.js", level: "Advanced", highlight: true },
      { name: "RESTful API Architecture", level: "Advanced" },
      { name: "Authentication (JWT & Sessions)", level: "Proficient" },
      { name: "API Security & Validation (Zod)", level: "Advanced" },
    ],
  },
  {
    id: "frontend",
    title: "Frontend Engineering & UI",
    eyebrow: "Layer 03 / Interface",
    description: "Crafting hardware-accelerated, responsive web applications with micro-interactions and clean code.",
    skills: [
      { name: "React 19", level: "Advanced", highlight: true },
      { name: "Next.js (App Router)", level: "Advanced", highlight: true },
      { name: "TypeScript", level: "Advanced", highlight: true },
      { name: "Tailwind CSS v4", level: "Advanced" },
      { name: "GSAP & Motion Choreography", level: "Proficient" },
    ],
  },
  {
    id: "analytics",
    title: "Business Analytics & Intelligence",
    eyebrow: "Layer 04 / Intelligence",
    description: "Bridging software engineering with quantitative decision-making, predictive data, and KPIs.",
    skills: [
      { name: "Python (Pandas & NumPy)", level: "Proficient", highlight: true },
      { name: "Data Visualization & Dashboards", level: "Advanced" },
      { name: "Statistical Modeling & Forecasting", level: "Proficient" },
      { name: "KPI Metrics & Reporting", level: "Advanced" },
      { name: "Git & Version Control", level: "Advanced" },
    ],
  },
];

