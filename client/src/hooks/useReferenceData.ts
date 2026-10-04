/**
 * Hook to fetch centralized reference data (languages, countries, cities, nationalities)
 * from the DB via tRPC. Falls back to empty array while loading.
 */
import { trpc } from "@/lib/trpc";

export function useReferenceData(type: "language" | "country" | "city" | "nationality") {
  const { data, isLoading } = trpc.referenceData.list.useQuery(
    { type },
    { staleTime: 5 * 60 * 1000 } // cache for 5 minutes
  );

  const options = (data ?? [])
    .filter((item) => item.isActive)
    .map((item) => ({ value: item.code, label: item.label }));

  return { options, isLoading };
}
