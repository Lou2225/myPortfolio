"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImageTransform } from "@/types/portfolio";
import { computeImageStageMatrix } from "@/lib/imageTransform";
import { cn } from "@/lib/utils";

export interface TransformedImageProps {
  src: string;
  alt: string;
  transform?: ImageTransform | null;
  defaultFit?: "cover" | "contain";
  defaultPosition?: "center" | "top" | "bottom";
  className?: string;
  imgClassName?: string;
  sizes?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  onNaturalSize?: (size: { width: number; height: number }) => void;
  onError?: () => void;
}

/**
 * Non-destructive image renderer that displays the untouched original image
 * with persisted zoom, pan (%), rotation, fit mode, and optional circle clip.
 */
export function TransformedImage({
  src,
  alt,
  transform,
  defaultFit = "cover",
  defaultPosition = "center",
  className,
  imgClassName,
  sizes,
  loading,
  fetchPriority,
  onNaturalSize,
  onError,
}: TransformedImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgNodeRef = useRef<HTMLImageElement | null>(null);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const [natSize, setNatSize] = useState<{ src: string; w: number; h: number }>({
    src: "",
    w: 0,
    h: 0,
  });

  const hasCustomTransform = Boolean(
    transform &&
      (Math.abs(transform.zoom - 1) > 0.001 ||
        Math.abs(transform.offsetXPercent) > 0.01 ||
        Math.abs(transform.offsetYPercent) > 0.01 ||
        transform.rotation % 360 !== 0 ||
        transform.fit !== defaultFit)
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasCustomTransform || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width > 0 && cr.height > 0) {
        setBoxSize((prev) =>
          prev.w === cr.width && prev.h === cr.height
            ? prev
            : { w: cr.width, h: cr.height }
        );
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [hasCustomTransform]);

  const onNaturalSizeRef = useRef(onNaturalSize);
  useEffect(() => {
    onNaturalSizeRef.current = onNaturalSize;
  }, [onNaturalSize]);

  const handleImgRef = useCallback(
    (node: HTMLImageElement | null) => {
      imgNodeRef.current = node;
      if (
        node &&
        node.complete &&
        node.naturalWidth > 0 &&
        node.naturalHeight > 0
      ) {
        onNaturalSizeRef.current?.({
          width: node.naturalWidth,
          height: node.naturalHeight,
        });
        setNatSize((prev) =>
          prev.src === src &&
          prev.w === node.naturalWidth &&
          prev.h === node.naturalHeight
            ? prev
            : { src, w: node.naturalWidth, h: node.naturalHeight }
        );
      }
    },
    [src]
  );

  const effectiveFit = transform?.fit ?? defaultFit;
  const fallbackPosClass =
    defaultPosition === "bottom"
      ? "object-bottom"
      : defaultPosition === "top"
        ? "object-top"
        : "object-center";

  const activeNat = natSize.src === src && natSize.w > 0 ? natSize : null;
  const canRenderExactMatrix =
    hasCustomTransform && boxSize.w > 0 && activeNat !== null;

  const matrix = canRenderExactMatrix
    ? computeImageStageMatrix({
        containerWidth: boxSize.w,
        containerHeight: boxSize.h,
        naturalWidth: activeNat.w,
        naturalHeight: activeNat.h,
        transform,
      })
    : null;

  const bakeScaleIntoBox = matrix !== null && matrix.scale < 1;
  const renderedWidth =
    matrix && activeNat
      ? bakeScaleIntoBox
        ? Math.max(1, Number((activeNat.w * matrix.scale).toFixed(2)))
        : activeNat.w
      : undefined;
  const renderedHeight =
    matrix && activeNat
      ? bakeScaleIntoBox
        ? Math.max(1, Number((activeNat.h * matrix.scale).toFixed(2)))
        : activeNat.h
      : undefined;
  const renderedScale =
    matrix && bakeScaleIntoBox ? 1 : (matrix?.scale ?? 1);

  const isLocalBlobOrData = /^(?:blob:|data:)/i.test(src);
  const useNextImage = Boolean(sizes && !isLocalBlobOrData);

  const computedStyle =
    matrix && activeNat
      ? {
          width: renderedWidth,
          height: renderedHeight,
          maxWidth: "none",
          maxHeight: "none",
          transform: `translate(-50%, -50%) translate3d(${matrix.translateX}px, ${matrix.translateY}px, 0) rotate(${matrix.rotationDeg}deg) scale(${renderedScale})`,
        }
      : hasCustomTransform && transform
        ? {
            transform: `translate3d(${transform.offsetXPercent}%, ${transform.offsetYPercent}%, 0) rotate(${transform.rotation}deg) scale(${transform.zoom})`,
          }
        : undefined;

  const computedClassName = cn(
    matrix
      ? "absolute left-1/2 top-1/2 block select-none will-change-transform"
      : cn(
          "w-full h-full block select-none",
          effectiveFit === "contain" ? "object-contain" : "object-cover",
          fallbackPosClass
        ),
    imgClassName
  );

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const t = e.currentTarget;
    if (t.naturalWidth > 0 && t.naturalHeight > 0) {
      onNaturalSizeRef.current?.({
        width: t.naturalWidth,
        height: t.naturalHeight,
      });
      setNatSize({ src, w: t.naturalWidth, h: t.naturalHeight });
    }
  };

  const sharedProps = {
    ref: handleImgRef,
    src,
    alt,
    loading,
    fetchPriority,
    draggable: false as const,
    onLoad: handleLoad,
    onError,
    style: computedStyle,
    className: computedClassName,
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full overflow-hidden",
        transform?.clipCircle && "rounded-full",
        className
      )}
    >
      {useNextImage ? (
        matrix && activeNat ? (
          <Image
            key={src}
            {...sharedProps}
            alt={alt}
            width={Math.max(1, Math.round(renderedWidth || activeNat.w))}
            height={Math.max(1, Math.round(renderedHeight || activeNat.h))}
            sizes={sizes}
          />
        ) : (
          <Image key={src} {...sharedProps} alt={alt} fill sizes={sizes} />
        )
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img key={src} {...sharedProps} alt={alt} />
      )}
    </div>
  );
}
