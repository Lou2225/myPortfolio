import { getPortfolioContent } from "@/lib/db";
import { createSocialPreviewImage } from "@/lib/ogPreview";

export const dynamic = "force-dynamic";
export const alt =
  "Lou Diamond Lava Valdellon — Full-Stack Developer & Business Analytics Portfolio";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const db = await getPortfolioContent();
  return createSocialPreviewImage(db, size);
}

