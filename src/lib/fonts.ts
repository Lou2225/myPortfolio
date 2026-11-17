import {
  Anton,
  Onest,
  Space_Grotesk,
  Plus_Jakarta_Sans,
  Bebas_Neue,
  Inter,
} from "next/font/google";
import type { FontPairingId } from "@/types/portfolio";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
  preload: true,
});

const onest = Onest({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-onest",
  display: "swap",
  preload: true,
});

const spaceGrotesk = Space_Grotesk({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: false,
});

const plusJakartaSans = Plus_Jakarta_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  preload: false,
});

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
  preload: false,
});

const inter = Inter({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});

const EDITORIAL_FONT_CLASSES = [anton.variable, onest.variable] as const;
const GEOMETRIC_FONT_CLASSES = [
  spaceGrotesk.variable,
  plusJakartaSans.variable,
] as const;
const MONOLITH_FONT_CLASSES = [
  bebasNeue.variable,
  inter.variable,
] as const;

export const ALL_FONT_PAIRING_CLASSES: readonly string[] = [
  ...EDITORIAL_FONT_CLASSES,
  ...GEOMETRIC_FONT_CLASSES,
  ...MONOLITH_FONT_CLASSES,
];

/**
 * Returns only the CSS variable classes needed for the configured typography pairing
 * so public pages avoid emitting preload/font-face declarations for inactive families.
 */
export function getFontPairingVariableClasses(pairing: FontPairingId): string {
  switch (pairing) {
    case "geometric":
      return GEOMETRIC_FONT_CLASSES.join(" ");
    case "monolith":
      return MONOLITH_FONT_CLASSES.join(" ");
    case "editorial":
    default:
      return EDITORIAL_FONT_CLASSES.join(" ");
  }
}
