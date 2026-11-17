import { ImageResponse } from "next/og";
import type { PortfolioDatabase } from "@/types/portfolio";
import { resolveAccentBaseHex, resolveAccentPalette } from "@/lib/appearance";

const SOCIAL_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

/**
 * Shared dynamic social preview card generator used by both `opengraph-image.tsx`
 * and `twitter-image.tsx`. Mirrors live profile copy and published appearance tokens.
 */
export function createSocialPreviewImage(
  db: PortfolioDatabase,
  size: { width: number; height: number } = SOCIAL_IMAGE_SIZE
): ImageResponse {
  const baseHex = resolveAccentBaseHex(db.appearance);
  const palette = resolveAccentPalette(baseHex);
  const isLight = db.appearance.defaultTheme === "light";

  const bg = isLight ? "#f5f2eb" : "#08080a";
  const surface = isLight ? "#ece7dd" : "#111114";
  const border = isLight ? "#d5cec2" : "#242429";
  const textPrimary = isLight ? "#111114" : "#f4f2ee";
  const textSecondary = isLight ? "#4b4741" : "#b5b0a8";
  const textMuted = isLight ? "#6d675f" : "#807c75";
  const accentText = isLight ? palette.textOnLight : palette.textOnDark;

  const monogram = (db.profile.monogram || "LV").slice(0, 3).toUpperCase();
  const fullName = (db.profile.fullName || "Lou Diamond Lava Valdellon").toUpperCase();
  const headline =
    db.profile.headline || "Full-Stack Developer & Business Analytics";
  const degree = db.profile.education.degree || "BS Information Technology";
  const major = db.profile.education.major || "Business Analytics";
  const graduationYear = db.profile.education.graduationYear || 2026;

  const rawBio = (db.profile.bio || "").trim();
  const bioSnippet =
    rawBio.length > 145
      ? `${rawBio.slice(0, 142).trimEnd()}...`
      : rawBio || "End-to-end systems engineering across database, API, and frontend.";

  const roles = db.profile.roles.slice(0, 4);
  const publishedProjectsCount = db.projects.filter(
    (p) => p.published !== false
  ).length;
  const contactTag =
    db.profile.contact.location ||
    db.profile.contact.email ||
    "Full-Stack · Business Analytics";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: bg,
          backgroundImage: `radial-gradient(circle at 88% 12%, ${palette.badgeBgRgba} 0%, transparent 52%), radial-gradient(circle at 12% 92%, ${palette.badgeBgRgba} 0%, transparent 45%)`,
          color: textPrimary,
          padding: "52px 60px",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {/* Top Brand & Live Deployment Telemetry Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "12px",
                backgroundColor: palette.accent,
                color: palette.contrastInk,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                fontWeight: 900,
                letterSpacing: "-0.04em",
              }}
            >
              {monogram}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: "14px",
                  fontWeight: 700,
                  letterSpacing: "0.2em",
                  color: accentText,
                }}
              >
                PORTFOLIO SYSTEM // CLASS OF {graduationYear}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: "15px",
                  color: textMuted,
                  letterSpacing: "0.06em",
                }}
              >
                {degree} · {major}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 18px",
              borderRadius: "9999px",
              backgroundColor: palette.badgeBgRgba,
              border: `1px solid ${palette.ringRgba}`,
              color: accentText,
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "0.14em",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "9999px",
                backgroundColor: palette.accent,
                display: "flex",
              }}
            />
            <div style={{ display: "flex" }}>
              {publishedProjectsCount}{" "}
              {publishedProjectsCount === 1 ? "DEPLOYED SYSTEM" : "DEPLOYED SYSTEMS"}
            </div>
          </div>
        </div>

        {/* Center Identity & Headline Block */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            marginTop: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "64px",
              fontWeight: 900,
              lineHeight: 0.98,
              letterSpacing: "-0.03em",
              color: textPrimary,
            }}
          >
            {fullName}
          </div>

          <div
            style={{
              display: "flex",
              fontSize: "28px",
              fontWeight: 700,
              lineHeight: 1.2,
              color: accentText,
            }}
          >
            {headline}
          </div>

          <div
            style={{
              display: "flex",
              fontSize: "20px",
              lineHeight: 1.45,
              color: textSecondary,
              maxWidth: "960px",
            }}
          >
            {bioSnippet}
          </div>
        </div>

        {/* Bottom Role Strip & Location Signature */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${border}`,
            paddingTop: "22px",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {roles.map((role) => (
              <div
                key={role}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 14px",
                  borderRadius: "6px",
                  backgroundColor: surface,
                  border: `1px solid ${border}`,
                  color: textPrimary,
                  fontSize: "14px",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                }}
              >
                {role}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              fontSize: "15px",
              fontWeight: 600,
              color: textMuted,
              letterSpacing: "0.08em",
            }}
          >
            {contactTag}
          </div>
        </div>
      </div>
    ),
    {
      width: size.width,
      height: size.height,
    }
  );
}

