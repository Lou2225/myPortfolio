"use client";

import { useSyncExternalStore } from "react";

const previewMap = new Map<string, string>();
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

/**
 * Registers an instant zero-latency local preview URL for a freshly uploaded
 * remote asset URL while the remote image finishes warming CDN/browser cache.
 */
export function registerInstantImage(remoteUrl: string, file: Blob): string {
  const cleanUrl = remoteUrl.trim();
  if (!cleanUrl || typeof URL === "undefined") return cleanUrl;

  const previousBlob = previewMap.get(cleanUrl);
  const blobUrl = URL.createObjectURL(file);
  previewMap.set(cleanUrl, blobUrl);
  notifyListeners();

  if (previousBlob && previousBlob.startsWith("blob:")) {
    URL.revokeObjectURL(previousBlob);
  }

  // Warm the remote CDN asset quietly in background before retiring blob override
  if (typeof Image !== "undefined" && !cleanUrl.startsWith("data:")) {
    const preloader = new Image();
    preloader.onload = () => {
      if (previewMap.get(cleanUrl) === blobUrl) {
        previewMap.delete(cleanUrl);
        notifyListeners();
        URL.revokeObjectURL(blobUrl);
      }
    };
    preloader.onerror = () => {
      // Keep fast local bitmap active during temporary CDN propagation lag
    };
    preloader.src = cleanUrl;
  }

  return blobUrl;
}

export function resolveInstantImageUrl(url?: string): string {
  const clean = (url || "").trim();
  if (!clean) return "";
  return previewMap.get(clean) || clean;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Subscribes a React component to instant zero-latency previews for uploaded images.
 */
export function useInstantImageUrl(url?: string): string {
  const clean = (url || "").trim();
  return useSyncExternalStore(
    subscribe,
    () => resolveInstantImageUrl(clean),
    () => clean
  );
}

/**
 * Uploads an image file to the admin upload endpoint, registers it for instant
 * zero-latency preview playback, and returns the saved asset URL.
 */
export async function uploadImageToAdminApi(
  file: File,
  folder: "hero" | "monogram" | "projects" | "certificates" | "general" = "general"
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  const res = await fetch("/api/admin/upload", {
    method: "POST",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || "Failed to upload image asset.");
  }
  registerInstantImage(data.url, file);
  return data.url as string;
}


