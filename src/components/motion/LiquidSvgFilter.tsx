"use client";

import React from "react";

export interface LiquidSvgFilterProps {
  active: boolean;
  filterId: string;
  baseFrequency: string;
  turbRef: React.RefObject<SVGFETurbulenceElement | null>;
  dispRef: React.RefObject<SVGFEDisplacementMapElement | null>;
}

/**
 * Shared hidden SVG displacement filter rendered only while a pointer-pass ripple is active.
 */
export function LiquidSvgFilter({
  active,
  filterId,
  baseFrequency,
  turbRef,
  dispRef,
}: LiquidSvgFilterProps) {
  if (!active) return null;

  return (
    <svg
      aria-hidden="true"
      className="absolute pointer-events-none w-0 h-0 opacity-0"
    >
      <defs>
        <filter id={filterId} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence
            ref={turbRef}
            type="fractalNoise"
            baseFrequency={baseFrequency}
            numOctaves={2}
            seed={2}
            result="noise"
          />
          <feDisplacementMap
            ref={dispRef}
            in="SourceGraphic"
            in2="noise"
            scale={0}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
