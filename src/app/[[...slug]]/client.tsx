"use client";

import dynamic from "next/dynamic";

const ClinicProviders = dynamic(
  () => import("@/main").then((mod) => mod.ClinicProviders),
  { ssr: false },
);

export function ClientOnly() {
  return <ClinicProviders />;
}
