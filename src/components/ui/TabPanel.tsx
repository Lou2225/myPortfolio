"use client";

import React from "react";
import { AdminCascade } from "@/components/motion/AdminMotion";

export interface TabPanelProps {
  activeKey: string;
  children: React.ReactNode;
  className?: string;
  staggerSec?: number;
  distance?: number;
  skipInitial?: boolean;
}

/**
 * Reusable animated tab panel for `/admin` that triggers a staggered GSAP cascade
 * whenever the active tab changes (split out from Tabs.tsx so public routes stay GSAP-free).
 */
export function TabPanel({
  activeKey,
  children,
  className,
  staggerSec = 0.042,
  distance = 14,
  skipInitial = true,
}: TabPanelProps) {
  return (
    <div role="tabpanel" className={className}>
      <AdminCascade
        activeKey={activeKey}
        staggerSec={staggerSec}
        distance={distance}
        skipInitial={skipInitial}
      >
        {children}
      </AdminCascade>
    </div>
  );
}
