"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "rect" | "circle" | "pill" | "text";
}

/**
 * Reusable GPU-Accelerated Skeleton Primitive
 * Uses composite `translate3d` shimmer animation with zero layout shift (CLS = 0).
 */
export function Skeleton({
  variant = "rect",
  className,
  ...props
}: SkeletonProps) {
  const variantClasses = {
    rect: "rounded-sm",
    circle: "rounded-full",
    pill: "rounded-full",
    text: "rounded-sm h-4 w-full",
  };

  return (
    <div
      aria-hidden="true"
      className={cn("lou-skeleton", variantClasses[variant], className)}
      {...props}
    />
  );
}

/**
 * Full-Page Admin CMS Dashboard Skeleton for Slow Connections
 */
export function AdminDashboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading Portfolio Management Dashboard"
      className="min-h-screen w-full max-w-full overflow-x-clip bg-(--bg-canvas) text-(--text-primary) pb-32 md:pb-16"
    >
      {/* Top Admin Header Bar Skeleton */}
      <div className="h-16 bg-(--bg-surface)/90 border-b border-(--border-subtle) px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton variant="rect" className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl" />
          <Skeleton variant="text" className="h-5 w-36" />
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton variant="circle" className="w-8.5 h-8.5" />
          <Skeleton variant="circle" className="w-8.5 h-8.5" />
          <Skeleton variant="pill" className="h-8.5 w-24 sm:w-36" />
        </div>
      </div>

      {/* Sculpted Left Vertical Rail Skeleton (Desktop/Tablet) */}
      <div className="hidden md:flex fixed left-0 top-16 bottom-4 z-30 items-center">
        <div className="w-18 h-122.5 rounded-r-[34px] bg-(--bg-surface) border-y border-r border-(--border-subtle) py-5 px-2.5 flex flex-col items-center justify-between">
          <Skeleton variant="circle" className="w-8 h-8" />
          <div className="flex flex-col gap-2">
            <Skeleton variant="rect" className="w-11 h-11 rounded-2xl" />
            <Skeleton variant="rect" className="w-11 h-11 rounded-2xl" />
            <Skeleton variant="rect" className="w-11 h-11 rounded-2xl" />
            <Skeleton variant="rect" className="w-11 h-11 rounded-2xl" />
            <Skeleton variant="rect" className="w-11 h-11 rounded-2xl" />
            <Skeleton variant="rect" className="w-11 h-11 rounded-2xl" />
            <Skeleton variant="rect" className="w-11 h-11 rounded-2xl" />
          </div>
          <Skeleton variant="circle" className="w-10 h-10" />
        </div>
      </div>

      {/* Main Workspace Skeleton */}
      <div className="w-full px-3 sm:px-6 lg:px-8 md:pl-22 lg:pl-24 pt-6 space-y-6">
        {/* Page Title Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-(--border-subtle)">
          <div className="space-y-2">
            <Skeleton variant="text" className="h-3 w-32" />
            <Skeleton variant="text" className="h-9 w-64 sm:w-80" />
            <Skeleton variant="text" className="h-4 w-72 sm:w-96" />
          </div>
          <Skeleton variant="rect" className="h-9 w-40 rounded-lg" />
        </div>

        {/* KPI Cards Row Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-xl p-5 space-y-3">
            <Skeleton variant="text" className="h-3 w-28" />
            <Skeleton variant="text" className="h-9 w-20" />
            <Skeleton variant="text" className="h-3 w-36" />
          </div>
          <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-xl p-5 space-y-3">
            <Skeleton variant="text" className="h-3 w-28" />
            <Skeleton variant="text" className="h-9 w-20" />
            <Skeleton variant="text" className="h-3 w-36" />
          </div>
          <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-xl p-5 space-y-3">
            <Skeleton variant="text" className="h-3 w-28" />
            <Skeleton variant="text" className="h-9 w-20" />
            <Skeleton variant="text" className="h-3 w-36" />
          </div>
          <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-xl p-5 space-y-3">
            <Skeleton variant="text" className="h-3 w-28" />
            <Skeleton variant="text" className="h-9 w-20" />
            <Skeleton variant="text" className="h-3 w-36" />
          </div>
        </div>

        {/* Analytics & Activity Panels Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-(--bg-surface) border border-(--border-subtle) rounded-xl p-6 space-y-5">
            <Skeleton variant="text" className="h-5 w-52" />
            <div className="space-y-3.5">
              <Skeleton variant="rect" className="h-10 w-full" />
              <Skeleton variant="rect" className="h-10 w-11/12" />
              <Skeleton variant="rect" className="h-10 w-4/5" />
              <Skeleton variant="rect" className="h-10 w-3/4" />
              <Skeleton variant="rect" className="h-10 w-2/3" />
            </div>
          </div>
          <div className="lg:col-span-5 bg-(--bg-surface) border border-(--border-subtle) rounded-xl p-6 space-y-5">
            <Skeleton variant="text" className="h-5 w-44" />
            <div className="space-y-3">
              <Skeleton variant="rect" className="h-14 w-full" />
              <Skeleton variant="rect" className="h-14 w-full" />
              <Skeleton variant="rect" className="h-14 w-full" />
              <Skeleton variant="rect" className="h-14 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

