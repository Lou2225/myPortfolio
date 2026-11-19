import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getPortfolioContent } from "@/lib/db";
import { toPublicPortfolioPayload } from "@/lib/portfolioPublic";
import { getSiteUrl } from "@/lib/siteUrl";
import { buildPrePaintAppearanceScript } from "@/lib/appearance";
import { getFontPairingVariableClasses } from "@/lib/fonts";
import { PortfolioProvider } from "@/context/PortfolioContext";
import { AppearanceRuntimeSync } from "@/components/appearance/AppearanceRuntimeSync";
import { OfflineManager } from "@/components/pwa/OfflineManager";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { FaviconSync } from "@/components/pwa/FaviconSync";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { Preloader } from "@/components/motion/Preloader";
import { JumpscareController } from "@/components/motion/JumpscareController";
import { BrandPortalProvider } from "@/components/motion/BrandPortal";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { ScrollToTop } from "@/components/ui/ScrollToTop";

export const viewport: Viewport = {
  themeColor: "#08080a",
};

export async function generateMetadata(): Promise<Metadata> {
  const db = await getPortfolioContent();
  const customLogo = (db.profile.monogramImageUrl || "").trim();
  const displayName = db.profile.fullName || "Lou Diamond Lava Valdellon";
  const shortTitle = `${db.profile.name || "Lou Diamond"} ${db.profile.lastName || "Valdellon"}`;
  const iconList = customLogo
    ? [{ url: customLogo }]
    : [
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { url: "/favicon.ico", type: "image/x-icon" },
      ];

  const pageTitle = shortTitle;
  const pageDescription =
    db.profile.bio ||
    "Graduating BSIT in Business Analytics & Full-Stack Developer. Stepped up as lead developer to build end-to-end systems from database schemas to interactive user interfaces.";

  const dynamicKeywords = Array.from(
    new Set(
      [
        displayName,
        shortTitle,
        db.profile.headline,
        db.profile.education.major,
        ...db.profile.roles,
        ...db.skills.flatMap((cat) => cat.skills.map((skill) => skill.name)),
      ]
        .map((item) => (item || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 18);

  return {
    metadataBase: getSiteUrl(),
    alternates: {
      canonical: "/",
    },
    robots: {
      index: true,
      follow: true,
    },
    title: pageTitle,
    description: pageDescription,
    keywords: dynamicKeywords,
    authors: [{ name: displayName }],
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: "/",
      siteName: `${shortTitle} — Portfolio`,
      type: "website",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: pageDescription,
    },
    manifest: "/manifest.webmanifest",
    icons: {
      icon: iconList,
      shortcut: customLogo ? [{ url: customLogo }] : undefined,
      apple: [
        {
          url: customLogo || "/icons/apple-touch-icon.png",
          sizes: "180x180",
        },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: db.profile.monogram || "LDV",
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await getPortfolioContent();
  const initialData = toPublicPortfolioPayload(db);

  const prePaintScript = buildPrePaintAppearanceScript(db.appearance);
  const fontVariables = getFontPairingVariableClasses(db.appearance.fontPairing);

  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prePaintScript }} />
      </head>
      <body className="bg-(--bg-canvas) text-(--text-primary) font-sans antialiased selection:bg-brand selection:text-brand-contrast">
        <PortfolioProvider initialData={initialData}>
          <AppearanceRuntimeSync />
          <FaviconSync />
          <OfflineManager>
            <Preloader />
            <JumpscareController />
            <SmoothScroll>
              <BrandPortalProvider>
                <Navbar />
                {children}
                <Footer />
                <ScrollToTop />
              </BrandPortalProvider>
            </SmoothScroll>
            <OfflineBanner />
          </OfflineManager>
        </PortfolioProvider>
      </body>
    </html>
  );
}
