/**
 * useTestUnits — fetches unit options for a lab test from the DB dictionary.
 * Falls back to the static labUnits.ts library if the DB has no unit data.
 *
 * Returns:
 *   units        — ordered list of unit strings (canonical first, then alternatives)
 *   canonicalUnit — the Turkish standard unit (or undefined if not set in DB)
 *   isLoading    — true while fetching
 *
 * Usage:
 *   const { units, canonicalUnit } = useTestUnits(testName);
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { getUnitsForTestOrCommon, getDefaultUnit } from "@/lib/labUnits";

export function useTestUnits(testName: string) {
  const enabled = testName.trim().length >= 2;

  const { data, isLoading } = trpc.labDictionary.getUnitsByName.useQuery(
    { name: testName.trim() },
    {
      enabled,
      staleTime: 5 * 60 * 1000, // cache 5 min — unit data rarely changes
      retry: false,
    }
  );

  const result = useMemo(() => {
    // If DB returned unit data, use it
    if (data && data.allUnits.length > 0) {
      return {
        units: data.allUnits,
        canonicalUnit: data.canonicalUnit ?? undefined,
        source: "db" as const,
      };
    }

    // Fallback: static labUnits.ts library
    const staticUnits = getUnitsForTestOrCommon(testName);
    const staticDefault = getDefaultUnit(testName);
    return {
      units: staticUnits,
      canonicalUnit: staticDefault,
      source: "static" as const,
    };
  }, [data, testName]);

  return {
    ...result,
    isLoading: enabled && isLoading,
  };
}
