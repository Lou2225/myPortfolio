"use client";

import { useState } from "react";
import { ImageTransform } from "@/types/portfolio";
import { useInstantImageUrl } from "@/lib/instantImageCache";
import { TransformedImage } from "@/components/ui/TransformedImage";
import { cn } from "@/lib/utils";

export interface MonogramBadgeProps {
  monogram: string;
  imageUrl?: string;
  transform?: ImageTransform;
  alt?: string;
  className?: string;
  textClassName?: string;
}

/**
 * Renders the owner's uploaded brand monogram logo edge-to-edge with its
 * non-destructive transform (zoom/pan/rotation/circle clip), falling back
 * cleanly to typographic monogram initials (e.g. "LDV").
 */
export function MonogramBadge({
  monogram,
  imageUrl,
  transform,
  alt,
  className,
  textClassName,
}: MonogramBadgeProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const resolvedUrl = useInstantImageUrl(imageUrl);
  const showImage = Boolean(resolvedUrl) && failedUrl !== resolvedUrl;

  if (showImage) {
    return (
      <span
        className={cn(
          "relative overflow-hidden inline-flex items-center justify-center shrink-0 p-0",
          className
        )}
      >
        <TransformedImage
          src={resolvedUrl}
          alt={alt || monogram || "Brand logo"}
          transform={transform}
          defaultFit="cover"
          defaultPosition="center"
          sizes="80px"
          onError={() => setFailedUrl(resolvedUrl)}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0",
        className,
        textClassName
      )}
    >
      {monogram || "LDV"}
    </span>
  );
}
