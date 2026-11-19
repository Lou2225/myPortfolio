"use client";

import { QueryClient } from "@tanstack/react-query";
import { PortfolioDatabase } from "@/types/portfolio";
import { PublicPortfolioData } from "@/context/PortfolioContext";

export const queryKeys = {
  publicPortfolio: ["portfolio", "public"] as const,
  adminAuth: ["admin", "auth"] as const,
  adminPortfolio: ["admin", "portfolio"] as const,
};

export const PUBLIC_CACHE_STORAGE_KEY = "lou_query_cache_public_v1";
const ADMIN_CACHE_STORAGE_KEY = "lou_query_cache_admin_v1";

export function readPersistedPublicCache(): PublicPortfolioData | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(PUBLIC_CACHE_STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as PublicPortfolioData;
  } catch {
    return undefined;
  }
}

export function writePersistedPublicCache(data: PublicPortfolioData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PUBLIC_CACHE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearPersistedPublicCache(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PUBLIC_CACHE_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export interface AdminPortfolioPayload {
  data: PortfolioDatabase;
  storageMode: "local-json" | "supabase";
}

export function readPersistedAdminCache(): AdminPortfolioPayload | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(ADMIN_CACHE_STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as AdminPortfolioPayload;
  } catch {
    return undefined;
  }
}

export function writePersistedAdminCache(payload: AdminPortfolioPayload): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ADMIN_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearPersistedAdminCache(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ADMIN_CACHE_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
          gcTime: 30 * 60 * 1000,
          retry: 2,
          refetchOnWindowFocus: false,
        },
      },
    });
  }

  if (!browserQueryClient) {
    browserQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
          gcTime: 30 * 60 * 1000,
          retry: 2,
          retryDelay: (attemptIndex) =>
            Math.min(1000 * 2 ** attemptIndex, 8000),
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
        },
        mutations: {
          retry: 1,
        },
      },
    });
  }

  return browserQueryClient;
}

