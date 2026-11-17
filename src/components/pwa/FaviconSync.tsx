"use client";

import { useEffect } from "react";
import { ImageTransform } from "@/types/portfolio";
import { usePortfolio } from "@/context/PortfolioContext";
import { useInstantImageUrl } from "@/lib/instantImageCache";
import { computeImageStageMatrix } from "@/lib/imageTransform";

function buildCacheBustedHref(url: string, version?: string): string {
  const clean = url.trim();
  if (!clean) return "/icons/icon-192.png";
  if (clean.startsWith("data:") || !version) return clean;
  const separator = clean.includes("?") ? "&" : "?";
  return `${clean}${separator}v=${encodeURIComponent(version)}`;
}

function applyDocumentFavicon(href: string) {
  const existingLinks = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(
      "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
    )
  );

  if (existingLinks.length === 0) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = href;
    document.head.appendChild(link);
    return;
  }

  for (const link of existingLinks) {
    if (link.href !== href) {
      link.removeAttribute("sizes");
      if (href.startsWith("data:image/png")) {
        link.type = "image/png";
      } else {
        link.removeAttribute("type");
      }
      link.href = href;
    }
  }
}

function renderCircularFaviconDataUrl(
  src: string,
  transform?: ImageTransform
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => {
      try {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.clearRect(0, 0, size, size);
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        const natW = img.naturalWidth || size;
        const natH = img.naturalHeight || size;
        const matrix = computeImageStageMatrix({
          containerWidth: size,
          containerHeight: size,
          naturalWidth: natW,
          naturalHeight: natH,
          transform,
        });

        ctx.save();
        ctx.translate(
          size / 2 + matrix.translateX,
          size / 2 + matrix.translateY
        );
        ctx.rotate((matrix.rotationDeg * Math.PI) / 180);
        ctx.scale(matrix.scale, matrix.scale);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, -natW / 2, -natH / 2, natW, natH);
        ctx.restore();

        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    const isRemoteHttp = /^https?:\/\//i.test(src);
    img.src = isRemoteHttp
      ? `${src}${src.includes("?") ? "&" : "?"}cors=favicon`
      : src;
  });
}

/**
 * Keeps browser tab favicon synchronized live whenever the Monogram Logo image
 * and its non-destructive transform are published in /admin.
 */
export function FaviconSync() {
  const { profile, updatedAt } = usePortfolio();
  const customUrl = (profile?.monogramImageUrl || "").trim();
  const instantCustomUrl = useInstantImageUrl(customUrl);
  const transform = profile?.monogramTransform;

  useEffect(() => {
    if (typeof document === "undefined") return;

    let cancelled = false;
    let idleId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const rawHref = instantCustomUrl
      ? instantCustomUrl.startsWith("blob:")
        ? instantCustomUrl
        : buildCacheBustedHref(instantCustomUrl, updatedAt || instantCustomUrl)
      : "/icons/icon-192.png";

    const syncCircularFavicon = () => {
      if (cancelled) return;
      if (instantCustomUrl) {
        applyDocumentFavicon(rawHref);
      }
      renderCircularFaviconDataUrl(rawHref, transform).then(
        (circularDataUrl) => {
          if (!cancelled && circularDataUrl) {
            applyDocumentFavicon(circularDataUrl);
          }
        }
      );
    };

    const scheduleSync = () => {
      timerId = setTimeout(() => {
        if ("requestIdleCallback" in window) {
          idleId = window.requestIdleCallback(syncCircularFavicon, {
            timeout: 4500,
          });
        } else {
          syncCircularFavicon();
        }
      }, 2600);
    };

    if (document.readyState === "complete") {
      scheduleSync();
    } else {
      window.addEventListener("load", scheduleSync, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleSync);
      if (timerId !== null) clearTimeout(timerId);
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [instantCustomUrl, updatedAt, transform]);

  return null;
}
