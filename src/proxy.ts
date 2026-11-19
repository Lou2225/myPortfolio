import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveCanonicalRedirectUrl } from "@/lib/siteUrl";

/**
 * Next.js 16 Proxy convention (`src/proxy.ts`).
 * Enforces canonical production hostname so device cookies, IndexedDB WebCrypto keys,
 * and passkey RP IDs stay unified on one origin.
 */
export function proxy(request: NextRequest) {
  const redirectTarget = resolveCanonicalRedirectUrl(
    request.url,
    request.headers
  );
  if (redirectTarget) {
    return NextResponse.redirect(redirectTarget, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest).*)",
  ],
};
