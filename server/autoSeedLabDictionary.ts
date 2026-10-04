/**
 * autoSeedLabDictionary.ts
 *
 * Runs at server startup (non-blocking). Upserts every entry in LAB_SEED_DATA
 * into the database and adds any missing aliases.  This ensures that seed
 * changes (new aliases, corrected resultType, etc.) are reflected in the live
 * DB without requiring a manual admin action.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { labDictionary, labDictionaryAliases } from "../drizzle/schema";
import { LAB_SEED_DATA } from "../shared/labDictionarySeed";

export async function autoSeedLabDictionary(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[autoSeed] DB not available — skipping lab dictionary auto-seed");
      return;
    }

    let updated = 0;
    let inserted = 0;
    let aliasesAdded = 0;

    for (const entry of LAB_SEED_DATA) {
      const existing = await db
        .select({ id: labDictionary.id })
        .from(labDictionary)
        .where(eq(labDictionary.canonicalName, entry.canonicalName))
        .limit(1);

      let dictId: number;

      if (existing.length > 0) {
        dictId = existing[0].id;
        // Always update to keep resultType, displayName, etc. in sync with seed
        await db
          .update(labDictionary)
          .set({
            displayName: entry.displayName,
            abbreviation: entry.abbreviation || null,
            resultType: entry.resultType as any,
            category: entry.category,
            specimen: entry.specimen || null,
            commonUnits: entry.commonUnits || null,
            suggestedModule: entry.suggestedModule as any,
            notes: entry.notes || null,
          })
          .where(eq(labDictionary.id, dictId));
        updated++;
      } else {
        const [result] = await db.insert(labDictionary).values({
          canonicalName: entry.canonicalName,
          displayName: entry.displayName,
          abbreviation: entry.abbreviation || null,
          resultType: entry.resultType as any,
          category: entry.category,
          specimen: entry.specimen || null,
          commonUnits: entry.commonUnits || null,
          suggestedModule: entry.suggestedModule as any,
          notes: entry.notes || null,
          isActive: true,
        });
        dictId = (result as any).insertId;
        inserted++;
      }

      // Add any missing aliases
      for (const alias of entry.aliases) {
        const existingAlias = await db
          .select({ id: labDictionaryAliases.id })
          .from(labDictionaryAliases)
          .where(
            and(
              eq(labDictionaryAliases.dictionaryId, dictId),
              eq(labDictionaryAliases.alias, alias),
              eq(labDictionaryAliases.scope, "global"),
            )
          )
          .limit(1);

        if (existingAlias.length === 0) {
          await db.insert(labDictionaryAliases).values({
            dictionaryId: dictId,
            alias,
            scope: "global",
            confirmedAt: new Date(),
          });
          aliasesAdded++;
        }
      }
    }

    console.log(
      `[autoSeed] Lab dictionary synced: ${inserted} new, ${updated} updated, ${aliasesAdded} aliases added`
    );
  } catch (err) {
    console.error("[autoSeed] Lab dictionary auto-seed failed:", err);
  }
}
