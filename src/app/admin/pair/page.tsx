import type { Metadata } from "next";
import { DevicePairClient } from "@/components/admin/DevicePairClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pair Device — Portfolio CMS",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

interface PairPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AdminPairPage({ searchParams }: PairPageProps) {
  const params = await searchParams;
  const rawChallenge = Array.isArray(params?.challenge)
    ? params.challenge[0]
    : params?.challenge;

  return <DevicePairClient challengeId={rawChallenge ?? null} />;
}

