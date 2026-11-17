import { Profile, SectionHeaders } from "@/types/portfolio";
import { DEFAULT_BIRTH_DATE, calculateAge } from "@/lib/date";

export const profileData: Profile = {
  name: "Lou Diamond",
  lastName: "Valdellon",
  middleName: "Lava",
  fullName: "Lou Diamond Lava Valdellon",
  monogram: "LDV",
  monogramImageUrl: "",
  birthDate: DEFAULT_BIRTH_DATE,
  age: calculateAge(DEFAULT_BIRTH_DATE) ?? 22,
  avatarUrl: "/assets/hero/avatar.webp",
  resumeUrl: "",
  education: {
    degree: "Bachelor of Science in Information Technology",
    major: "Business Analytics",
    graduationYear: 2026,
    status: "Graduating Student",
  },
  headline: "Full-Stack Developer & Business Analytics Specialist",
  roles: [
    "Full-Stack Developer",
    "Analytics Engineer",
    "Systems Architect",
    "Problem Solver",
  ],
  bio: "Graduating BSIT in Business Analytics. I bridge data intelligence with end-to-end software engineering—architecting databases, engineering backend APIs, and building intuitive user interfaces that turn complex challenges into scalable digital systems.",
  heroCtaPrimary: "View Systems",
  heroCtaSecondary: "Contact Me",
  heroScrollCue: "Scroll to enter the story",
  storyHeading: "From Curiosity to Complete Full-Stack Ownership.",
  storyBody: [
    "During our group initiatives and capstone projects, our team needed someone to build the actual working system. I stepped up and took full ownership across all three pillars: the database schemas, the backend APIs, and the frontend interface.",
    "That crucible of end-to-end responsibility is where I truly learned how code, data, and architectures connect. I discovered that great software isn't just about syntax—it's about understanding how data flows, solving bottlenecks, and relentlessly executing until the solution is bulletproof.",
  ],
  contact: {
    email: "loudiamond.valdellon@gmail.com",
    github: "https://github.com",
    linkedin: "https://linkedin.com",
    location: "Philippines",
    status: "Available for Software Engineering Roles",
  },
};

export const defaultSectionHeaders: SectionHeaders = {
  storyEyebrow: "CH // 01 · The Origin Story",
  skillsEyebrow: "CH // 02 · Full-Stack Capabilities",
  skillsHeading: "THE FOUR SYSTEM LAYERS.",
  skillsSubtitle:
    "Bridging database infrastructure with modern frontend engineering and quantitative business analytics.",
  projectsEyebrow: "CH // 03 · Selected Work",
  projectsHeading: "SYSTEMS ENGINEERED END-TO-END.",
  projectsCounterLabel: "Featured Systems",
  impactEyebrow: "CH // 04 · By The Numbers",
  impactHeading: "MEASURED COMMITMENT.",
  contactEyebrow: "CH // 05 · Initiate Collaboration",
  contactHeading: "HAVE A SYSTEM TO BUILD OR A TEAM TO GROW?",
  contactSubtitle:
    "I am graduating as a BSIT Business Analytics major with complete full-stack engineering ownership. Actively seeking software engineering, full-stack, and backend developer opportunities.",
  contactFormTitle: "Direct In-Site Dispatch",
  contactFormSubtitle:
    "Send a message directly through this form. Validated with Zod and stored directly in the Portfolio Management Inbox.",
  footerTagline: "Full-Stack Developer · BSIT Business Analytics",
};
