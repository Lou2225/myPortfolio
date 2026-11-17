"use client";

import dynamic from "next/dynamic";

export const DeferredProjects = dynamic(() =>
  import("@/components/sections/Projects").then((m) => m.Projects)
);

export const DeferredContact = dynamic(() =>
  import("@/components/sections/Contact").then((m) => m.Contact)
);
