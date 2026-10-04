import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM as invokeRawLLM } from "../_core/llm";
import { pendingLabTests } from "../../drizzle/schema";
import { getDb } from "../db";
import { labDictionary, labDictionaryAliases, labDictionaryChangelog, users } from "../../drizzle/schema";
import { eq, like, or, and, desc, asc, sql, inArray, gte, lte } from "drizzle-orm";
import { LAB_SEED_DATA } from "../../shared/labDictionarySeed";
import { storageGetBytes } from "../storage";

const RESULT_TYPES = [
  "Quantitative",
  "Qualitative",
  "Molecular/PCR",
  "Genetic",
  "Microbiology Culture",
  "Microscopy/Parasitology",
  "Panel/Profile",
  "Pathology/Biopsy",
  "Semen Analysis",
  "Semen DNA",
  "Therapeutic Drug Monitoring",
  "Descriptive/Report",
] as const;

const SUGGESTED_MODULES = [
  "general_lab",
  "semen_analysis",
  "semen_dna",
  "genetic",
  "radiology",
  "pathology",
] as const;

const invokeLLM = (params: Omit<Parameters<typeof invokeRawLLM>[0], "workloadId">) =>
  invokeRawLLM({ workloadId: "laboratory_dictionary_enrichment", ...params });

export const labDictionaryRouter = router({
  // ── Search / Autocomplete ──────────────────────────────────────────────────
  search: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(50).default(15),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const qExact = input.query.toLowerCase().trim();
      // Tokenize: split by spaces/hyphens, filter short tokens
      const tokens = qExact.split(/[\s\-\/]+/).filter(t => t.length >= 2);
      // Use full query as one token too (for exact/phrase match)
      const allTokens = Array.from(new Set([qExact, ...tokens]));

      // Collect candidate IDs from direct field matches (for each token)
      const seenIds = new Set<number>();
      const candidateMap = new Map<number, { entry: typeof directAll[0]; matchCount: number; exactScore: number }>();

      // Fetch all matching entries for the full query first (phrase match)
      const q = `%${input.query}%`;
      const directAll = await db
        .select()
        .from(labDictionary)
        .where(
          and(
            eq(labDictionary.isActive, true),
            or(
              like(labDictionary.canonicalName, q),
              like(labDictionary.displayName, q),
              like(labDictionary.abbreviation, q),
            )
          )
        )
        .limit(input.limit * 4);

      // Fetch alias matches for full query
      const aliasMatchesFull = await db
        .select({ dictionaryId: labDictionaryAliases.dictionaryId })
        .from(labDictionaryAliases)
        .where(like(labDictionaryAliases.alias, q))
        .groupBy(labDictionaryAliases.dictionaryId)
        .limit(40);

      const fullAliasIds = aliasMatchesFull.map(a => a.dictionaryId);
      let fullAliasEntries: typeof directAll = [];
      if (fullAliasIds.length > 0) {
        fullAliasEntries = await db
          .select()
          .from(labDictionary)
          .where(
            and(
              eq(labDictionary.isActive, true),
              sql`${labDictionary.id} IN (${sql.join(fullAliasIds.map(id => sql`${id}`), sql`, `)})`
            )
          )
          .limit(input.limit * 3);
      }

      // Add phrase-match candidates with high base score
      for (const e of [...directAll, ...fullAliasEntries]) {
        if (!seenIds.has(e.id)) {
          seenIds.add(e.id);
          candidateMap.set(e.id, { entry: e, matchCount: tokens.length + 1, exactScore: 0 });
        }
      }

      // Token-based search: for each individual token, find matches
      if (tokens.length > 1) {
        for (const token of tokens) {
          const tq = `%${token}%`;
          const tokenDirect = await db
            .select()
            .from(labDictionary)
            .where(
              and(
                eq(labDictionary.isActive, true),
                or(
                  like(labDictionary.canonicalName, tq),
                  like(labDictionary.displayName, tq),
                  like(labDictionary.abbreviation, tq),
                )
              )
            )
            .limit(input.limit * 3);

          const tokenAliasMatches = await db
            .select({ dictionaryId: labDictionaryAliases.dictionaryId })
            .from(labDictionaryAliases)
            .where(like(labDictionaryAliases.alias, tq))
            .groupBy(labDictionaryAliases.dictionaryId)
            .limit(30);

          const tokenAliasIds = tokenAliasMatches.map(a => a.dictionaryId);
          let tokenAliasEntries: typeof directAll = [];
          if (tokenAliasIds.length > 0) {
            tokenAliasEntries = await db
              .select()
              .from(labDictionary)
              .where(
                and(
                  eq(labDictionary.isActive, true),
                  sql`${labDictionary.id} IN (${sql.join(tokenAliasIds.map(id => sql`${id}`), sql`, `)})`
                )
              )
              .limit(input.limit * 2);
          }

          for (const e of [...tokenDirect, ...tokenAliasEntries]) {
            if (!seenIds.has(e.id)) {
              seenIds.add(e.id);
              candidateMap.set(e.id, { entry: e, matchCount: 1, exactScore: 10 });
            } else {
              // Already seen — increment match count (more tokens matched = better)
              const existing = candidateMap.get(e.id)!;
              candidateMap.set(e.id, { ...existing, matchCount: existing.matchCount + 1 });
            }
          }
        }
      }

      // Smart ranking: exact abbreviation > exact name > starts-with > token-count desc > contains
      const score = (e: typeof directAll[0], matchCount: number, exactScore: number): number => {
        const name = (e.canonicalName || '').toLowerCase();
        const display = (e.displayName || '').toLowerCase();
        const abbr = (e.abbreviation || '').toLowerCase();
        if (abbr === qExact) return 0;                                          // exact abbreviation
        if (name === qExact || display === qExact) return 1;                    // exact name
        if (abbr.startsWith(qExact)) return 2;                                  // abbr starts with
        if (name.startsWith(qExact) || display.startsWith(qExact)) return 3;   // name starts with
        // Token matches: more tokens matched = lower score (better)
        if (tokens.length > 1 && matchCount >= tokens.length) return 4;        // all tokens matched
        if (tokens.length > 1 && matchCount >= Math.ceil(tokens.length / 2)) return 5; // majority matched
        return 6 + exactScore;                                                  // partial / contains
      };

      const results = Array.from(candidateMap.values());
      results.sort((a, b) =>
        score(a.entry, a.matchCount, a.exactScore) - score(b.entry, b.matchCount, b.exactScore)
      );
      return results.slice(0, input.limit).map(r => r.entry);
    }),

  // ── Get single entry with aliases ─────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [entry] = await db
        .select()
        .from(labDictionary)
        .where(eq(labDictionary.id, input.id))
        .limit(1);
      if (!entry) return null;

      const aliases = await db
        .select()
        .from(labDictionaryAliases)
        .where(eq(labDictionaryAliases.dictionaryId, input.id))
        .orderBy(asc(labDictionaryAliases.scope), asc(labDictionaryAliases.alias));

      return { ...entry, aliases };
    }),

  // ── List all (admin) ──────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      resultType: z.enum(RESULT_TYPES).optional(),
      isActive: z.boolean().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(50),
      dateFrom: z.string().optional(), // ISO date string YYYY-MM-DD
      dateTo: z.string().optional(),   // ISO date string YYYY-MM-DD
      sortBy: z.enum(["name", "createdAt", "updatedAt"]).default("name"),
      sortDir: z.enum(["asc", "desc"]).default("asc"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0, page: input.page, pageSize: input.pageSize, totalPages: 0 };

      const offset = (input.page - 1) * input.pageSize;
      const conditions = [];

      // Score-based search state (populated when search is provided)
      let scoredIds: { id: number; score: number }[] = [];
      let searchActive = false;

      if (input.search) {
        searchActive = true;
        const searchLower = input.search.toLowerCase().trim();
        // Tokenize: split by spaces/hyphens, filter tokens < 2 chars
        const tokens = searchLower.split(/[\s\-\/]+/).filter(t => t.length >= 2);

        // Score map: id -> score
        const scoreMap = new Map<number, number>();
        const addScore = (id: number, score: number) => {
          scoreMap.set(id, (scoreMap.get(id) ?? 0) + score);
        };

        // 1. Exact alias match (highest score: 100)
        const exactAliasRows = await db
          .select({ dictionaryId: labDictionaryAliases.dictionaryId })
          .from(labDictionaryAliases)
          .where(sql`LOWER(${labDictionaryAliases.alias}) = ${searchLower}`)
          .groupBy(labDictionaryAliases.dictionaryId);
        exactAliasRows.forEach(r => addScore(r.dictionaryId, 100));

        // 2. Exact canonical/display/abbreviation match (score: 90)
        const exactDirectRows = await db
          .select({ id: labDictionary.id })
          .from(labDictionary)
          .where(or(
            sql`LOWER(${labDictionary.canonicalName}) = ${searchLower}`,
            sql`LOWER(${labDictionary.displayName}) = ${searchLower}`,
            sql`LOWER(${labDictionary.abbreviation}) = ${searchLower}`,
          ));
        exactDirectRows.forEach(r => addScore(r.id, 90));

        // 3. Phrase match in direct fields (score: 50)
        const phraseQ = `%${searchLower}%`;
        const phraseDirectRows = await db
          .select({ id: labDictionary.id })
          .from(labDictionary)
          .where(or(
            sql`LOWER(${labDictionary.canonicalName}) LIKE ${phraseQ}`,
            sql`LOWER(${labDictionary.displayName}) LIKE ${phraseQ}`,
            sql`LOWER(${labDictionary.abbreviation}) LIKE ${phraseQ}`,
          ));
        phraseDirectRows.forEach(r => addScore(r.id, 50));

        // 4. Phrase match in aliases (score: 40)
        const phraseAliasRows = await db
          .select({ dictionaryId: labDictionaryAliases.dictionaryId })
          .from(labDictionaryAliases)
          .where(sql`LOWER(${labDictionaryAliases.alias}) LIKE ${phraseQ}`)
          .groupBy(labDictionaryAliases.dictionaryId);
        phraseAliasRows.forEach(r => addScore(r.dictionaryId, 40));

        // 5. Per-token matches (score: 10 per token matched)
        if (tokens.length > 1) {
          for (const token of tokens) {
            const tq = `%${token}%`;
            const tokenDirectRows = await db
              .select({ id: labDictionary.id })
              .from(labDictionary)
              .where(or(
                sql`LOWER(${labDictionary.canonicalName}) LIKE ${tq}`,
                sql`LOWER(${labDictionary.displayName}) LIKE ${tq}`,
                sql`LOWER(${labDictionary.abbreviation}) LIKE ${tq}`,
                sql`LOWER(${labDictionary.category}) LIKE ${tq}`,
              ));
            tokenDirectRows.forEach(r => addScore(r.id, 10));

            const tokenAliasRows = await db
              .select({ dictionaryId: labDictionaryAliases.dictionaryId })
              .from(labDictionaryAliases)
              .where(sql`LOWER(${labDictionaryAliases.alias}) LIKE ${tq}`)
              .groupBy(labDictionaryAliases.dictionaryId);
            tokenAliasRows.forEach(r => addScore(r.dictionaryId, 10));
          }
        }

        // Only include entries with score >= minimum threshold
        // Strategy: require at least ceil(tokens.length / 2) tokens to match
        // e.g. 3 tokens → need 2 matched (score >= 20); 2 tokens → need 2 matched (score >= 20); 1 token → need 1 (score >= 10)
        // But if we have exact/phrase matches (score >= 40), use those as the primary results
        const hasHighScoreMatches = Array.from(scoreMap.values()).some(s => s >= 40);
        let minScore: number;
        if (hasHighScoreMatches) {
          // We have exact or phrase matches — only include entries that also have at least some token match
          minScore = 20;
        } else if (tokens.length >= 2) {
          // Multi-token query: require at least 2 tokens to match (score >= 20)
          minScore = 20;
        } else {
          // Single token query: any match is fine
          minScore = 10;
        }

        scoredIds = Array.from(scoreMap.entries())
          .filter(([, score]) => score >= minScore)
          .sort((a, b) => b[1] - a[1])
          .map(([id, score]) => ({ id, score }));

        if (scoredIds.length > 0) {
          conditions.push(
            sql`${labDictionary.id} IN (${sql.join(scoredIds.map(({ id }) => sql`${id}`), sql`, `)})`
          );
        } else {
          // No matches at all — force empty result
          conditions.push(sql`0 = 1`);
        }
      }
      if (input.category) {
        conditions.push(like(labDictionary.category, `%${input.category}%`));
      }
      if (input.resultType) {
        conditions.push(eq(labDictionary.resultType, input.resultType));
      }
      if (input.isActive !== undefined) {
        conditions.push(eq(labDictionary.isActive, input.isActive));
      }
      if (input.dateFrom) {
        conditions.push(gte(labDictionary.createdAt, new Date(input.dateFrom + "T00:00:00.000Z")));
      }
      if (input.dateTo) {
        conditions.push(lte(labDictionary.createdAt, new Date(input.dateTo + "T23:59:59.999Z")));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(labDictionary)
        .where(whereClause);

      // Determine sort order
      const sortOrder = input.sortDir === "desc" ? desc : asc;
      const orderByCol = input.sortBy === "createdAt" ? labDictionary.createdAt : input.sortBy === "updatedAt" ? labDictionary.updatedAt : labDictionary.canonicalName;

      // Fetch rows with user join for addedByName
      let rawRows = await db
        .select({
          id: labDictionary.id,
          canonicalName: labDictionary.canonicalName,
          displayName: labDictionary.displayName,
          abbreviation: labDictionary.abbreviation,
          resultType: labDictionary.resultType,
          category: labDictionary.category,
          specimen: labDictionary.specimen,
          commonUnits: labDictionary.commonUnits,
          suggestedModule: labDictionary.suggestedModule,
          notes: labDictionary.notes,
          isActive: labDictionary.isActive,
          createdById: labDictionary.createdById,
          updatedById: labDictionary.updatedById,
          createdAt: labDictionary.createdAt,
          updatedAt: labDictionary.updatedAt,
          addedByName: users.name,
        })
        .from(labDictionary)
        .leftJoin(users, eq(labDictionary.createdById, users.id))
        .where(whereClause)
        .orderBy(searchActive ? asc(labDictionary.canonicalName) : sortOrder(orderByCol))
        .limit(searchActive ? input.pageSize * 4 : input.pageSize)
        .offset(searchActive ? 0 : offset);

      if (searchActive && scoredIds.length > 0) {
        // Re-sort rows by score order from scoredIds
        const scoreOrder = new Map(scoredIds.map(({ id, score }, idx) => [id, { score, idx }]));
        rawRows = rawRows
          .sort((a, b) => {
            const sa = scoreOrder.get(a.id);
            const sb = scoreOrder.get(b.id);
            if (!sa || !sb) return 0;
            return sb.score - sa.score || sa.idx - sb.idx;
          })
          .slice(offset, offset + input.pageSize);
      }

      return {
        rows: rawRows,
        total: Number(countResult.count),
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(Number(countResult.count) / input.pageSize),
      };
    }),

  // ── Create ────────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      canonicalName: z.string().min(1).max(256),
      displayName: z.string().min(1).max(512),
      abbreviation: z.string().max(64).optional(),
      resultType: z.enum(RESULT_TYPES),
      category: z.string().max(128).optional(),
      specimen: z.string().max(128).optional(),
      commonUnits: z.string().max(256).optional(),
      canonicalUnit: z.string().max(64).optional(),
      alternativeUnits: z.string().optional(),   // JSON array string
      conversionFactors: z.string().optional(),  // JSON object string
      suggestedModule: z.enum(SUGGESTED_MODULES).default("general_lab"),
      notes: z.string().optional(),
      aliases: z.array(z.string()).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const { aliases, ...rest } = input;

      // Check for existing entry with same canonical name (case-insensitive)
      const existing = await db
        .select({ id: labDictionary.id })
        .from(labDictionary)
        .where(sql`LOWER(${labDictionary.canonicalName}) = ${input.canonicalName.toLowerCase()}`)
        .limit(1);

      if (existing.length > 0) {
        // Entry already exists — return existing ID, do not fail
        return { id: existing[0].id, deduplicated: true };
      }

      const [result] = await db
        .insert(labDictionary)
        .values({ ...rest, createdById: ctx.user.id, updatedById: ctx.user.id });

      const newId = (result as any).insertId as number;

      // Log creation
      await db.insert(labDictionaryChangelog).values({
        dictionaryId: newId,
        changeType: "created",
        newValue: JSON.stringify({ canonicalName: input.canonicalName }),
        performedById: ctx.user.id,
        performedByName: ctx.user.name ?? undefined,
      });

      if (aliases.length > 0) {
        const aliasInserts = aliases.map((alias) => ({
          dictionaryId: newId,
          alias,
          scope: "global" as const,
          confirmedById: ctx.user.id,
          confirmedAt: new Date(),
        }));
        await db.insert(labDictionaryAliases).values(aliasInserts);
        // Log each alias
        for (const alias of aliases) {
          await db.insert(labDictionaryChangelog).values({
            dictionaryId: newId,
            changeType: "alias_added",
            newValue: alias,
            performedById: ctx.user.id,
            performedByName: ctx.user.name ?? undefined,
          });
        }
      }
      return { id: newId, deduplicated: false };
    }),

  // ── Update ────────────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      canonicalName: z.string().min(1).max(256).optional(),
      displayName: z.string().min(1).max(512).optional(),
      abbreviation: z.string().max(64).optional().nullable(),
      resultType: z.enum(RESULT_TYPES).optional(),
      category: z.string().max(128).optional().nullable(),
      specimen: z.string().max(128).optional().nullable(),
      commonUnits: z.string().max(256).optional().nullable(),
      canonicalUnit: z.string().max(64).optional().nullable(),
      alternativeUnits: z.string().optional().nullable(),  // JSON array string
      conversionFactors: z.string().optional().nullable(), // JSON object string
      suggestedModule: z.enum(SUGGESTED_MODULES).optional(),
      analyteGroup: z.string().max(128).optional().nullable(),
      orderType: z.enum(["Single Result Test", "Timed Component", "Protocol Name", "Genetic / Molecular"]).optional().nullable(),
      notes: z.string().optional().nullable(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const { id, ...rest } = input;
      // Fetch old values for changelog
      const [oldEntry] = await db.select().from(labDictionary).where(eq(labDictionary.id, id)).limit(1);
      await db
        .update(labDictionary)
        .set({ ...rest, updatedById: ctx.user.id })
        .where(eq(labDictionary.id, id));
      // Log each changed field
      if (oldEntry) {
        for (const [key, newVal] of Object.entries(rest)) {
          const oldVal = (oldEntry as Record<string, unknown>)[key];
          if (String(oldVal ?? '') !== String(newVal ?? '')) {
            await db.insert(labDictionaryChangelog).values({
              dictionaryId: id,
              changeType: "updated",
              fieldName: key,
              oldValue: String(oldVal ?? ''),
              newValue: String(newVal ?? ''),
              performedById: ctx.user.id,
              performedByName: ctx.user.name ?? undefined,
            });
          }
        }
      }
      return { success: true };
    }),

  // ── Toggle active ─────────────────────────────────────────────────────────
  toggleActive: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      await db
        .update(labDictionary)
        .set({ isActive: input.isActive, updatedById: ctx.user.id })
        .where(eq(labDictionary.id, input.id));
      return { success: true };
    }),

  // ── Delete ───────────────────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Delete aliases first (FK constraint)
      await db
        .delete(labDictionaryAliases)
        .where(eq(labDictionaryAliases.dictionaryId, input.id));

      // Delete the dictionary entry
      await db
        .delete(labDictionary)
        .where(eq(labDictionary.id, input.id));

      return { success: true };
    }),

  // ── Bulk Delete ──────────────────────────────────────────────────────────────
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      if (!['admin', 'manager'].includes(ctx.user.role)) {
        throw new Error('Unauthorized: only admin or manager can bulk delete');
      }
      const db = await getDb();
      if (!db) throw new Error('DB not available');

      for (const id of input.ids) {
        await db.delete(labDictionaryAliases).where(eq(labDictionaryAliases.dictionaryId, id));
        await db.delete(labDictionary).where(eq(labDictionary.id, id));
      }
      return { success: true, deleted: input.ids.length };
    }),

  // ── Generate AI Aliases for a single test ────────────────────────────────────
  generateAliasesForTest: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('DB not available');

      const [entry] = await db
        .select()
        .from(labDictionary)
        .where(eq(labDictionary.id, input.id))
        .limit(1);
      if (!entry) throw new Error('Test not found');

      // Get existing aliases to avoid duplicates
      const existingAliases = await db
        .select({ alias: labDictionaryAliases.alias })
        .from(labDictionaryAliases)
        .where(eq(labDictionaryAliases.dictionaryId, input.id));
      const existingSet = new Set(existingAliases.map((a) => a.alias.toLowerCase()));

        const response = await invokeLLM({
          messages: [
          {
            role: 'system',
            content: `You are a medical laboratory terminology expert. Generate alternative names and aliases for lab tests.
Rules:
1. Include plural/singular variants (e.g., "Monocyte#" → "Monocytes#")
2. Include common abbreviations and full names
3. Include OCR error variants (e.g., missing space, hyphen variations)
4. Include common misspellings seen in lab reports
5. Include variants with/without symbols (#, %, -)
6. Do NOT include the canonical name itself
7. Return minimum 10 aliases (aim for 10-20)
8. Focus on variants that would appear in actual lab PDF reports`,
          },
          {
            role: 'user',
            content: `Generate aliases for this lab test:
Canonical Name: ${entry.canonicalName}
Display Name: ${entry.displayName}
Abbreviation: ${entry.abbreviation || 'none'}
Category: ${entry.category}
Units: ${entry.commonUnits || 'none'}

Return JSON: { "aliases": ["alias1", "alias2", ...] }`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'alias_list',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                aliases: { type: 'array', items: { type: 'string' } },
              },
              required: ['aliases'],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content ?? '{}';
      const content = typeof rawContent === 'string' ? rawContent : '{}';
      const parsed = JSON.parse(content);
      const suggestedAliases: string[] = Array.isArray(parsed.aliases)
        ? parsed.aliases.filter((a: unknown) => typeof a === 'string' && a.length > 0 && !existingSet.has((a as string).toLowerCase()))
        : [];

      // Save the new aliases
      let added = 0;
      for (const alias of suggestedAliases) {
        await db.insert(labDictionaryAliases).values({
          dictionaryId: input.id,
          alias,
          scope: 'global',
          confirmedById: ctx.user.id,
          confirmedAt: new Date(),
        });
        added++;
      }

      return { success: true, added, aliases: suggestedAliases };
    }),

  // ── Get tests with zero aliases (for client-side batching) ──────────────────────
  getTestsWithZeroAliases: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error('DB not available');

      const allTests = await db
        .select({ id: labDictionary.id, canonicalName: labDictionary.canonicalName })
        .from(labDictionary)
        .where(eq(labDictionary.isActive, true));

      const aliasCountsRaw = await db
        .select({
          dictionaryId: labDictionaryAliases.dictionaryId,
          count: sql<number>`COUNT(*)`
        })
        .from(labDictionaryAliases)
        .groupBy(labDictionaryAliases.dictionaryId);

      const aliasCountMap = new Map(aliasCountsRaw.map((r) => [r.dictionaryId, Number(r.count)]));
      const zeroAliasTests = allTests.filter((t) => (aliasCountMap.get(t.id) ?? 0) === 0);
      return { ids: zeroAliasTests.map((t) => t.id), total: zeroAliasTests.length };
    }),

  // ── Bulk Generate AI Aliases (for tests with 0 aliases) ──────────────────────
  bulkGenerateAliases: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1), // always require explicit IDs — client handles batching
    }))
    .mutation(async ({ input, ctx }) => {
      if (!['admin', 'manager'].includes(ctx.user.role)) {
        throw new Error('Unauthorized: only admin or manager can bulk generate aliases');
      }
      const db = await getDb();
      if (!db) throw new Error('DB not available');

      const targets = await db
        .select({
          id: labDictionary.id,
          canonicalName: labDictionary.canonicalName,
          displayName: labDictionary.displayName,
          abbreviation: labDictionary.abbreviation,
          category: labDictionary.category,
          commonUnits: labDictionary.commonUnits,
        })
        .from(labDictionary)
        .where(inArray(labDictionary.id, input.ids));

      let totalAdded = 0;
      let processed = 0;

      for (const entry of targets) {
        try {
          const response = await invokeLLM({
            messages: [
              {
                role: 'system',
                content: 'You are a medical laboratory terminology expert. Generate at least 10 alternative names and aliases for lab tests including plural/singular variants, abbreviations, OCR variants, Turkish lab variants, and common misspellings. Return JSON only. Minimum 10 aliases required.',
              },
              {
                role: 'user',
                content: `Generate at least 10 aliases for: "${entry.canonicalName}" (display: "${entry.displayName}", abbrev: "${entry.abbreviation || 'none'}", category: "${entry.category}"). Include full name variants, abbreviations, plural/singular, hyphen variants, OCR variants, Turkish lab name variants. Return JSON: { "aliases": ["alias1", ...] }`,
              },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'alias_list',
                strict: true,
                schema: {
                  type: 'object',
                  properties: { aliases: { type: 'array', items: { type: 'string' } } },
                  required: ['aliases'],
                  additionalProperties: false,
                },
              },
            },
          });

          const rawContent = response.choices?.[0]?.message?.content ?? '{}';
          const content = typeof rawContent === 'string' ? rawContent : '{}';
          const parsed = JSON.parse(content);
          const aliases: string[] = Array.isArray(parsed.aliases)
            ? parsed.aliases.filter((a: unknown) => typeof a === 'string' && a.length > 0)
            : [];

          for (const alias of aliases) {
            const existing = await db
              .select({ id: labDictionaryAliases.id })
              .from(labDictionaryAliases)
              .where(and(
                eq(labDictionaryAliases.dictionaryId, entry.id),
                sql`LOWER(${labDictionaryAliases.alias}) = ${alias.toLowerCase()}`
              ))
              .limit(1);
            if (existing.length === 0) {
              await db.insert(labDictionaryAliases).values({
                dictionaryId: entry.id,
                alias,
                scope: 'global',
                confirmedById: ctx.user.id,
                confirmedAt: new Date(),
              });
              totalAdded++;
            }
          }
          processed++;
        } catch (e) {
          console.error(`[bulkGenerateAliases] Failed for ${entry.canonicalName}:`, e);
        }
      }

      return { success: true, processed, totalAdded };
    }),

  // ── Alias management ──────────────────────────────────────────────────────
  addAlias: protectedProcedure
    .input(z.object({
      dictionaryId: z.number(),
      alias: z.string().min(1).max(512),
      scope: z.enum(["global", "patient"]).default("global"),
      patientId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Dedup check: don't insert if alias already exists for this dictionary entry
      const existingAliasEntry = await db
        .select({ id: labDictionaryAliases.id })
        .from(labDictionaryAliases)
        .where(and(
          eq(labDictionaryAliases.dictionaryId, input.dictionaryId),
          sql`LOWER(${labDictionaryAliases.alias}) = ${input.alias.toLowerCase()}`
        ))
        .limit(1);
      if (existingAliasEntry.length > 0) return { id: existingAliasEntry[0].id, deduplicated: true };
      const [result] = await db.insert(labDictionaryAliases).values({
        dictionaryId: input.dictionaryId,
        alias: input.alias,
        scope: input.scope,
        patientId: input.patientId,
        confirmedById: ctx.user.id,
        confirmedAt: new Date(),
      });
      const aliasId = (result as any).insertId as number;
      // Log alias addition
      await db.insert(labDictionaryChangelog).values({
        dictionaryId: input.dictionaryId,
        changeType: "alias_added",
        newValue: input.alias,
        aliasId,
        performedById: ctx.user.id,
        performedByName: ctx.user.name ?? undefined,
      });
      return { id: aliasId };
    }),

  deleteAlias: protectedProcedure
    .input(z.object({ aliasId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Fetch alias before deleting for changelog
      const [alias] = await db.select().from(labDictionaryAliases).where(eq(labDictionaryAliases.id, input.aliasId)).limit(1);
      await db
        .delete(labDictionaryAliases)
        .where(eq(labDictionaryAliases.id, input.aliasId));
      // Log alias removal
      if (alias) {
        await db.insert(labDictionaryChangelog).values({
          dictionaryId: alias.dictionaryId,
          changeType: "alias_removed",
          oldValue: alias.alias,
          aliasId: input.aliasId,
          performedById: ctx.user.id,
          performedByName: ctx.user.name ?? undefined,
        });
      }
      return { success: true };
    }),

  // ── Save confirmed match as alias ─────────────────────────────────────────
  confirmAlias: protectedProcedure
    .input(z.object({
      dictionaryId: z.number(),
      alias: z.string().min(1),
      scope: z.enum(["global", "patient"]).default("patient"),
      patientId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const existing = await db
        .select()
        .from(labDictionaryAliases)
        .where(
          and(
            eq(labDictionaryAliases.dictionaryId, input.dictionaryId),
            eq(labDictionaryAliases.alias, input.alias),
            eq(labDictionaryAliases.scope, input.scope),
          )
        )
        .limit(1);

      if (existing.length > 0) return { id: existing[0].id, alreadyExists: true };

      const [result] = await db.insert(labDictionaryAliases).values({
        dictionaryId: input.dictionaryId,
        alias: input.alias,
        scope: input.scope,
        patientId: input.patientId,
        confirmedById: ctx.user.id,
        confirmedAt: new Date(),
      });
      return { id: (result as any).insertId, alreadyExists: false };
    }),

  // ── Seed from LAB_SEED_DATA ───────────────────────────────────────────────
  seedDictionary: protectedProcedure
    .input(z.object({ force: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      if (!["admin", "manager"].includes(ctx.user.role)) {
        throw new Error("Unauthorized: only admin or manager can seed the dictionary");
      }

      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(labDictionary);
      const existingCount = Number(countResult.count);
      const seedCount = LAB_SEED_DATA.length;

      // Only block if force=false AND the DB already has at least as many entries as the seed
      // (meaning nothing new to add). If DB has fewer entries than seed, always proceed to add missing ones.
      if (existingCount >= seedCount && !input.force) {
        return {
          success: false,
          message: `Dictionary already has ${existingCount} entries (seed has ${seedCount}). Use force=true to re-seed all entries.`,
          count: existingCount,
        };
      }

      let inserted = 0;
      let aliasesInserted = 0;

      for (const entry of LAB_SEED_DATA) {
        const existing = await db
          .select({ id: labDictionary.id })
          .from(labDictionary)
          .where(eq(labDictionary.canonicalName, entry.canonicalName))
          .limit(1);

        let dictId: number;

        if (existing.length > 0) {
          dictId = existing[0].id;
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
              updatedById: ctx.user.id,
            })
            .where(eq(labDictionary.id, dictId));
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
            createdById: ctx.user.id,
            updatedById: ctx.user.id,
          });
          dictId = (result as any).insertId;
          inserted++;
        }

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
              confirmedById: ctx.user.id,
              confirmedAt: new Date(),
            });
            aliasesInserted++;
          }
        }
      }

      return {
        success: true,
        message: `Seeded ${inserted} new entries, updated existing. ${aliasesInserted} aliases inserted.`,
        count: inserted,
        aliasesCount: aliasesInserted,
      };
    }),

  // ── Get result type info (for UI) ─────────────────────────────────────────
  getResultTypes: protectedProcedure.query(() => {
    return RESULT_TYPES.map((rt) => ({
      value: rt,
      label: rt,
      description: RESULT_TYPE_DESCRIPTIONS[rt] || "",
    }));
  }),

  // ── Lookup by name (for AI import matching) ───────────────────────────────
  lookupByName: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      patientId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { entry: null, matchType: "no_match" };

      const normalizedName = input.name.trim().toLowerCase();

      // 1. Try exact canonical name match
      const exactMatch = await db
        .select()
        .from(labDictionary)
        .where(
          and(
            eq(labDictionary.isActive, true),
            sql`LOWER(${labDictionary.canonicalName}) = ${normalizedName}`
          )
        )
        .limit(1);

      if (exactMatch.length > 0) {
        return { entry: exactMatch[0], matchType: "exact_canonical" };
      }

      // 2. Try exact alias match (global first, then patient-level)
      const aliasConditions = [
        and(
          eq(labDictionaryAliases.scope, "global"),
          sql`LOWER(${labDictionaryAliases.alias}) = ${normalizedName}`
        )
      ];
      if (input.patientId) {
        aliasConditions.push(
          and(
            eq(labDictionaryAliases.scope, "patient"),
            eq(labDictionaryAliases.patientId, input.patientId),
            sql`LOWER(${labDictionaryAliases.alias}) = ${normalizedName}`
          )
        );
      }

      const aliasMatch = await db
        .select({
          dictionaryId: labDictionaryAliases.dictionaryId,
          scope: labDictionaryAliases.scope,
        })
        .from(labDictionaryAliases)
        .where(or(...aliasConditions))
        .orderBy(desc(labDictionaryAliases.scope))
        .limit(1);

      if (aliasMatch.length > 0) {
        const [entry] = await db
          .select()
          .from(labDictionary)
          .where(eq(labDictionary.id, aliasMatch[0].dictionaryId))
          .limit(1);
        if (entry) {
          return {
            entry,
            matchType: aliasMatch[0].scope === "patient" ? "patient_alias" : "global_alias",
          };
        }
      }

      // 3. Fuzzy: LIKE match on canonical name
      const fuzzyMatch = await db
        .select()
        .from(labDictionary)
        .where(
          and(
            eq(labDictionary.isActive, true),
            or(
              sql`LOWER(${labDictionary.canonicalName}) LIKE ${`%${normalizedName}%`}`,
              sql`LOWER(${labDictionary.displayName}) LIKE ${`%${normalizedName}%`}`,
              sql`LOWER(${labDictionary.abbreviation}) LIKE ${`%${normalizedName}%`}`,
            )
          )
        )
        .limit(3);

      if (fuzzyMatch.length > 0) {
        return { entry: fuzzyMatch[0], matchType: "fuzzy", suggestions: fuzzyMatch };
      }

      return { entry: null, matchType: "no_match" };
    }),

  // ── Get categories list ───────────────────────────────────────────────────
  getCategories: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({ category: labDictionary.category })
      .from(labDictionary)
      .where(eq(labDictionary.isActive, true))
      .groupBy(labDictionary.category)
      .orderBy(asc(labDictionary.category));
    return rows.map((r) => r.category).filter(Boolean);
  }),

  // ── AI: Suggest result types for a batch of unknown test names ────────────
  suggestResultTypes: protectedProcedure
    .input(z.object({
      testNames: z.array(z.string().min(1)).min(1).max(100),
    }))
    .mutation(async ({ input }) => {
      const { testNames } = input;
      const typeDescriptions = Object.entries(RESULT_TYPE_DESCRIPTIONS)
        .map(([k, v]) => `- ${k}: ${v}`).join("\n");

      const prompt = `You are a medical laboratory expert. For each lab test name below, suggest the most appropriate result type from this list:\n\n${typeDescriptions}\n\nReturn a JSON array where each element has:\n- testName: exact test name as provided\n- suggestedType: one of the result type names above\n- confidence: "high", "medium", or "low"\n- category: short category label (e.g., "Hematology", "Hormones", "Thyroid", "Immunology", "Microbiology", "Genetics", "Biochemistry", "Coagulation", "Tumor Markers", "Fertility", "Serology", "Urinalysis")\n- specimen: likely specimen type (e.g., "Blood", "Urine", "Semen", "Stool", "Tissue", "Swab")\n- units: common units if Quantitative (e.g., "ng/mL", "IU/L", "%"), empty string if not applicable\n\nTest names:\n${testNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n\nReturn ONLY valid JSON array, no markdown, no explanation.`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a medical laboratory expert. Always respond with valid JSON only." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "lab_type_suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        testName: { type: "string" },
                        suggestedType: { type: "string" },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                        category: { type: "string" },
                        specimen: { type: "string" },
                        units: { type: "string" },
                      },
                      required: ["testName", "suggestedType", "confidence", "category", "specimen", "units"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = response.choices?.[0]?.message?.content ?? "{}";
        const content = typeof rawContent === "string" ? rawContent : "{}";
        const parsed = JSON.parse(content);
        return (parsed.suggestions ?? []) as Array<{
          testName: string;
          suggestedType: string;
          confidence: "high" | "medium" | "low";
          category: string;
          specimen: string;
          units: string;
        }>;
      } catch (e) {
        console.error("[suggestResultTypes] AI error:", e);
        return [];
      }
    }),

  // ── Pending Lab Tests: list (admin) ──────────────────────────────────────
  listPending: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "approved", "rejected", "merged", "all"]).default("pending"),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const offset = (input.page - 1) * input.pageSize;
      const conditions = input.status !== "all" ? [eq(pendingLabTests.status, input.status as any)] : [];
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(pendingLabTests)
        .where(whereClause);
      const rows = await db
        .select()
        .from(pendingLabTests)
        .where(whereClause)
        .orderBy(desc(pendingLabTests.createdAt))
        .limit(input.pageSize)
        .offset(offset);
      return { rows, total: Number(countResult.count) };
    }),

  // ── Pending Lab Tests: submit (any user) ─────────────────────────────────
  submitPending: protectedProcedure
    .input(z.object({
      rawName: z.string().min(1).max(512),
      source: z.enum(["patient_entry", "pdf_import"]).default("patient_entry"),
      patientId: z.number().optional(),
      suggestedResultType: z.string().optional(),
      suggestedCategory: z.string().optional(),
      suggestedSpecimen: z.string().optional(),
      suggestedUnits: z.string().optional(),
      aiConfidence: z.enum(["high", "medium", "low"]).optional(),
      possibleMatchId: z.number().optional(),
      possibleMatchName: z.string().optional(),
      possibleMatchScore: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      // Check if already pending with same name
      const existing = await db
        .select({ id: pendingLabTests.id })
        .from(pendingLabTests)
        .where(and(
          sql`LOWER(${pendingLabTests.rawName}) = ${input.rawName.toLowerCase()}`,
          eq(pendingLabTests.status, "pending")
        ))
        .limit(1);
      if (existing.length > 0) return { id: existing[0].id, deduplicated: true };
      // Check if already exists as an approved alias in the dictionary
      // If so, no need to create a pending entry — it's already known
      const existingAlias = await db
        .select({ id: labDictionaryAliases.id, dictionaryId: labDictionaryAliases.dictionaryId })
        .from(labDictionaryAliases)
        .where(sql`LOWER(${labDictionaryAliases.alias}) = ${input.rawName.toLowerCase()}`)
        .limit(1);
      if (existingAlias.length > 0) return { id: -1, deduplicated: true, alreadyAlias: true, dictionaryId: existingAlias[0].dictionaryId };
      const [result] = await db
        .insert(pendingLabTests)
        .values({
          rawName: input.rawName,
          source: input.source,
          patientId: input.patientId,
          suggestedResultType: input.suggestedResultType,
          suggestedCategory: input.suggestedCategory,
          suggestedSpecimen: input.suggestedSpecimen,
          suggestedUnits: input.suggestedUnits,
          aiConfidence: input.aiConfidence ?? "medium",
          possibleMatchId: input.possibleMatchId,
          possibleMatchName: input.possibleMatchName,
          possibleMatchScore: input.possibleMatchScore,
          submittedById: ctx.user.id,
        });
      return { id: (result as any).insertId, deduplicated: false };
    }),

  // ── Pending Lab Tests: review action (admin) ─────────────────────────────
  reviewPending: protectedProcedure
    .input(z.object({
      id: z.number(),
      action: z.enum(["approve", "reject", "merge"]),
      // For approve: final values to save to dictionary
      canonicalName: z.string().optional(),
      displayName: z.string().optional(),
      abbreviation: z.string().optional(),
      resultType: z.enum(RESULT_TYPES).optional(),
      category: z.string().optional(),
      specimen: z.string().optional(),
      commonUnits: z.string().optional(),
      canonicalUnit: z.string().optional(),
      alternativeUnits: z.string().optional(),  // JSON array string
      conversionFactors: z.string().optional(), // JSON object string
      analyteGroup: z.string().optional().nullable(),
      orderType: z.enum(["Single Result Test", "Timed Component", "Protocol Name", "Genetic / Molecular"]).optional().nullable(),
      notes: z.string().optional().nullable(),
      suggestedModule: z.enum(SUGGESTED_MODULES).optional(),
      // For merge: existing dictionary entry to add alias to
      mergeIntoDictionaryId: z.number().optional(),
      rejectionReason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const [pending] = await db
        .select()
        .from(pendingLabTests)
        .where(eq(pendingLabTests.id, input.id))
        .limit(1);
      if (!pending) throw new Error("Pending test not found");

      if (input.action === "approve") {
        const canonicalName = input.canonicalName ?? pending.rawName;
        const displayName = input.displayName ?? pending.suggestedDisplayName ?? canonicalName;
        const resultType = (input.resultType ?? pending.suggestedResultType ?? "Quantitative") as typeof RESULT_TYPES[number];
        const [newEntry] = await db
          .insert(labDictionary)
          .values({
            canonicalName,
            displayName,
            abbreviation: input.abbreviation ?? pending.suggestedAbbreviation ?? undefined,
            resultType,
            category: input.category ?? pending.suggestedCategory ?? undefined,
            specimen: input.specimen ?? pending.suggestedSpecimen ?? undefined,
            commonUnits: input.commonUnits ?? pending.suggestedUnits ?? undefined,
            canonicalUnit: input.canonicalUnit ?? undefined,
            alternativeUnits: input.alternativeUnits ?? undefined,
            conversionFactors: input.conversionFactors ?? undefined,
            analyteGroup: input.analyteGroup ?? undefined,
            orderType: input.orderType ?? undefined,
            notes: input.notes ?? undefined,
            suggestedModule: input.suggestedModule ?? undefined,
            createdById: ctx.user.id,
            updatedById: ctx.user.id,
          });
        // Add raw name as alias if different from canonical
        if (pending.rawName.toLowerCase() !== canonicalName.toLowerCase()) {
          await db.insert(labDictionaryAliases).values({
            dictionaryId: (newEntry as any).insertId,
            alias: pending.rawName,
            scope: "global",
            confirmedById: ctx.user.id,
            confirmedAt: new Date(),
          });
        }
        await db.update(pendingLabTests)
          .set({ status: "approved", reviewedById: ctx.user.id, reviewedAt: new Date() })
          .where(eq(pendingLabTests.id, input.id));
        const newDictId = (newEntry as any).insertId as number;
        // Log approval
        await db.insert(labDictionaryChangelog).values({
          dictionaryId: newDictId,
          changeType: "approved_from_pending",
          newValue: JSON.stringify({ canonicalName, displayName }),
          performedById: ctx.user.id,
          performedByName: ctx.user.name ?? undefined,
        });
        return { success: true, dictionaryId: newDictId };
      }

      if (input.action === "merge" && input.mergeIntoDictionaryId) {
        // Dedup check: don't insert if alias already exists for this dictionary entry
        const existingMergeAlias = await db
          .select({ id: labDictionaryAliases.id })
          .from(labDictionaryAliases)
          .where(and(
            eq(labDictionaryAliases.dictionaryId, input.mergeIntoDictionaryId),
            sql`LOWER(${labDictionaryAliases.alias}) = ${pending.rawName.toLowerCase()}`
          ))
          .limit(1);
        let mergeAliasId: number;
        if (existingMergeAlias.length > 0) {
          // Alias already exists — just update pending status
          mergeAliasId = existingMergeAlias[0].id;
        } else {
          const [mergeAliasResult] = await db.insert(labDictionaryAliases).values({
            dictionaryId: input.mergeIntoDictionaryId,
            alias: pending.rawName,
            scope: "global",
            confirmedById: ctx.user.id,
            confirmedAt: new Date(),
          });
          mergeAliasId = (mergeAliasResult as any).insertId;
          // Log merge as alias
          await db.insert(labDictionaryChangelog).values({
            dictionaryId: input.mergeIntoDictionaryId,
            changeType: "alias_added",
            newValue: pending.rawName,
            aliasId: mergeAliasId,
            performedById: ctx.user.id,
            performedByName: ctx.user.name ?? undefined,
          });
        }
        await db.update(pendingLabTests)
          .set({ status: "merged", mergedIntoDictionaryId: input.mergeIntoDictionaryId, reviewedById: ctx.user.id, reviewedAt: new Date() })
          .where(eq(pendingLabTests.id, input.id));
        return { success: true };
      }

      if (input.action === "reject") {
        await db.update(pendingLabTests)
          .set({ status: "rejected", rejectionReason: input.rejectionReason, reviewedById: ctx.user.id, reviewedAt: new Date() })
          .where(eq(pendingLabTests.id, input.id));
        return { success: true };
      }

      throw new Error("Invalid action");
    }),

  // ── Import from PDF ──────────────────────────────────────────────────────
  importDictionaryFromPdf: protectedProcedure
    .input(z.object({
      fileUrl: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // 1. Fetch file as base64
      let fileBase64: string;
      let mime = "application/pdf";
      try {
        // fileUrl may be a relative /manus-storage/... path or a full URL
        // Extract the key from the URL and use storageGetBytes for server-side access
        const urlPath = input.fileUrl.replace(/^\/manus-storage\//, "").replace(/^\/api\/storage\//, "");
        let buf: Buffer;
        if (input.fileUrl.startsWith("http://") || input.fileUrl.startsWith("https://")) {
          // Full absolute URL — fetch directly
          const resp = await fetch(input.fileUrl);
          if (!resp.ok) throw new Error("Failed to fetch PDF");
          buf = Buffer.from(await resp.arrayBuffer());
        } else {
          // Relative storage key — use storageGetBytes
          const result = await storageGetBytes(urlPath);
          buf = result.data;
          mime = result.contentType || "application/pdf";
        }
        fileBase64 = buf.toString("base64");
      } catch (e) {
        throw new Error("Could not read the uploaded file.");
      }

      // 2. Extract AND normalize test names via AI (single combined step)
      const extractPrompt = `You are a medical laboratory expert analyzing a lab report PDF.

Your task: Extract ALL lab test names, normalize them, and provide review metadata.

CRITICAL RULES:
1. CORRECT obvious OCR/spelling mistakes automatically:
   - "Neutophil" → "Neutrophil", "Lymphocte" → "Lymphocyte", "Eosinphil" → "Eosinophil"
   - "Haemoglobin" → "Hemoglobin" (standardize spelling)
   - Fix any clear OCR artifacts (missing letters, transpositions)

2. NEVER merge these — they are DIFFERENT tests:
   - Absolute count (#) vs Percentage (%): Neutrophil# ≠ Neutrophil%, Monocyte# ≠ Monocyte%, NRBC# ≠ NRBC%
   - RDW-CV ≠ RDW-SD, P-LCC ≠ P-LCR, MCH ≠ MCHC, MPV ≠ MCV, PDW ≠ RDW, PLT ≠ PCT
   - Hb ≠ Hb%

3. NORMALIZE naming style (use singular, keep symbols):
   - "Monocytes#" → "Monocyte#", "Neutrophils %" → "Neutrophil %"
   - Keep # for absolute count, % for percentage

4. STANDARD UNITS — use these exact units:
   CBC: WBC→x10^9/L, Neutrophil#→x10^9/L, Lymphocyte#→x10^9/L, Monocyte#→x10^9/L, Eosinophil#→x10^9/L, Basophil#→x10^9/L, PLT→x10^9/L, NRBC#→x10^9/L, P-LCC→x10^9/L
   CBC: RBC→x10^12/L, Hb→g/dL, HCT→%, Neutrophil%→%, Lymphocyte%→%, Monocyte%→%, Eosinophil%→%, Basophil%→%, NRBC%→%, RDW-CV→%, P-LCR→%, PDW→%
   CBC: MCV→fL, MPV→fL, RDW-SD→fL, MCH→pg, MCHC→g/dL
   Coagulation: PT→seconds, INR→ratio

5. FLAG uncommon or ambiguous names with a review warning (e.g., "Hb%" is uncommon).

For each test, return:
- extractedName: the raw name as it appeared in the PDF
- correctedName: the normalized/corrected name (same as extractedName if no correction needed)
- wasCorrected: true if the name was changed from extracted
- correctionNote: brief note if corrected (e.g., "Corrected spelling", "Normalized to singular"), empty string if not
- reviewWarning: warning if name is unusual or ambiguous, empty string if none
- suggestedType: result type from the list
- confidence: "high", "medium", or "low"
- category: e.g., "Hematology", "Coagulation", "Hormones", "Biochemistry"
- specimen: e.g., "Blood", "Urine", "Semen"
- units: standard units as specified above, empty string if not applicable
- suggestedAliases: array of 2-5 safe alias names for this test (generate from correctedName ONLY, never from extractedName if it was an OCR mistake)

Deduplication: if the same test appears multiple times, include it only once.
Return ONLY valid JSON, no markdown.`;

      let extractedTests: Array<{
        extractedName: string;
        correctedName: string;
        wasCorrected: boolean;
        correctionNote: string;
        reviewWarning: string;
        suggestedType: string;
        confidence: string;
        category: string;
        specimen: string;
        units: string;
        suggestedAliases: string[];
      }> = [];

      try {
        const extractRes = await invokeLLM({
          messages: [
            { role: "system", content: "You are a medical laboratory expert. Always respond with valid JSON only." },
            { role: "user", content: [
              { type: "text", text: extractPrompt },
              { type: "file_url", file_url: { url: `data:${mime};base64,${fileBase64}`, mime_type: "application/pdf" } }
            ]},
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "extracted_tests_v2",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  tests: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        extractedName: { type: "string" },
                        correctedName: { type: "string" },
                        wasCorrected: { type: "boolean" },
                        correctionNote: { type: "string" },
                        reviewWarning: { type: "string" },
                        suggestedType: { type: "string" },
                        confidence: { type: "string" },
                        category: { type: "string" },
                        specimen: { type: "string" },
                        units: { type: "string" },
                        suggestedAliases: { type: "array", items: { type: "string" } },
                      },
                      required: ["extractedName", "correctedName", "wasCorrected", "correctionNote", "reviewWarning", "suggestedType", "confidence", "category", "specimen", "units", "suggestedAliases"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["tests"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = extractRes.choices?.[0]?.message?.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : content;
        extractedTests = (parsed.tests ?? []).filter((t: any) => t.correctedName?.trim());
      } catch (e) {
        throw new Error("AI extraction failed. Please try again.");
      }

      if (extractedTests.length === 0) {
        return { extracted: [], existing: [], newTests: [] };
      }

      // 3. Compare with dictionary using correctedName (exact + alias match)
      const allEntries = await db
        .select({ id: labDictionary.id, canonicalName: labDictionary.canonicalName, displayName: labDictionary.displayName, abbreviation: labDictionary.abbreviation })
        .from(labDictionary);
      const allAliases = await db
        .select({ dictionaryId: labDictionaryAliases.dictionaryId, alias: labDictionaryAliases.alias })
        .from(labDictionaryAliases);

      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9#%]/g, "");
      const exactMap = new Map<string, number>(); // normalized name -> dict id
      for (const e of allEntries) {
        exactMap.set(normalize(e.canonicalName), e.id);
        exactMap.set(normalize(e.displayName), e.id);
        if (e.abbreviation) exactMap.set(normalize(e.abbreviation), e.id);
      }
      for (const a of allAliases) {
        exactMap.set(normalize(a.alias), a.dictionaryId);
      }

      const existing: Array<{ name: string; matchedId: number; matchedName: string }> = [];
      const newTests: typeof extractedTests = [];

      for (const t of extractedTests) {
        // Match using correctedName (normalized)
        const norm = normalize(t.correctedName);
        if (exactMap.has(norm)) {
          const matchedId = exactMap.get(norm)!;
          const entry = allEntries.find(e => e.id === matchedId);
          existing.push({ name: t.correctedName, matchedId, matchedName: entry?.displayName ?? entry?.canonicalName ?? t.correctedName });
        } else {
          newTests.push(t);
        }
      }

      return {
        extracted: extractedTests.map(t => t.correctedName),
        existing,
        newTests: newTests.map(t => ({
          name: t.correctedName,           // final editable name (pre-filled with corrected)
          originalName: t.extractedName,   // raw OCR name for display
          wasCorrected: t.wasCorrected,
          correctionNote: t.correctionNote,
          reviewWarning: t.reviewWarning,
          suggestedType: t.suggestedType || "Quantitative",
          confidence: t.confidence || "low",
          category: t.category || "",
          specimen: t.specimen || "Blood",
          units: t.units || "",
          suggestedAliases: t.suggestedAliases || [],
        })),
      };
    }),

  // ── AI: Suggest all fields for a single test name (for Pending Review form) ──
  aiSuggestFields: protectedProcedure
    .input(z.object({
      rawName: z.string().min(1).max(512),
    }))
    .mutation(async ({ input }) => {
      const typeDescriptions = Object.entries(RESULT_TYPE_DESCRIPTIONS)
        .map(([k, v]) => `- ${k}: ${v}`).join("\n");

      const moduleOptions = [
        "general_lab",
        "semen_analysis",
        "semen_dna",
        "genetic",
        "radiology",
        "pathology",
      ];

      const prompt = `You are a medical laboratory expert specializing in Turkish healthcare standards. Given the lab test name "${input.rawName}", suggest the best values for all dictionary fields.

Available result types:
${typeDescriptions}

Available suggested modules: ${moduleOptions.join(", ")}

Return a JSON object with these fields:
- canonicalName: the standard/official name for this test (string)
- displayName: a user-friendly display name, may include parenthetical description (string)
- abbreviation: common abbreviation if any, empty string if none (string)
- resultType: one of the result type names above (string)
- suggestedModule: one of the module options above (string)
- category: short category label e.g. "Hematology", "Hormones", "Thyroid", "Immunology", "Fertility", "Biochemistry", "Coagulation", "Tumor Markers", "Serology", "Urinalysis", "Vitamins / Bone" (string)
- specimen: likely specimen type e.g. "Blood", "Urine", "Semen", "Stool", "Tissue", "Swab" (string)
- commonUnits: common units if Quantitative e.g. "ng/mL", "IU/L", "%", empty string if not applicable (string)
- canonicalUnit: the single standard unit used in Turkish clinical labs for this test (e.g. "mg/dL", "mIU/L", "ng/mL"). Empty string if Qualitative or not applicable. This is the unit ALL values will be normalized to.
- alternativeUnits: JSON array string of other units commonly seen in Turkish labs for this test (e.g. "[\\"mmol/L\\",\\"mEq/L\\"]"). Empty array "[]" if none.
- conversionFactors: JSON object string mapping each alternative unit to its multiplication factor to convert to canonicalUnit (e.g. "{\\"mmol/L\\":38.67}"). Empty object "{}" if none. Formula: value_in_canonical = value_in_alt * factor.
- aliases: array of at least 10 common alternative names, abbreviations, and synonyms for this test. Include: full name variants, abbreviations, plural/singular forms, hyphenated/non-hyphenated variants, OCR-common variants, Turkish lab name variants, and any other names seen in lab reports. MINIMUM 10 aliases required. (array of strings)
- analyteGroup: the medical analyte family this test belongs to. Examples: "Glucose / OGTT", "Thyroid", "CBC", "Testosterone", "Reproductive Hormones", "Lipid Panel", "Liver Function", "Kidney Function", "Coagulation", "Tumor Markers", "Vitamins", "Electrolytes", "Infectious Disease", "Autoimmune", "Genetics". Use a concise group name that groups related tests together. (string)
- orderType: what kind of dictionary entry this is. Must be exactly one of: "Single Result Test" (one test, one value, standalone — e.g. TSH, AMH, Hemoglobin), "Timed Component" (one measurement within a timed protocol — e.g. Glucose 2 Hour, Cortisol 30 min), "Protocol Name" (the name of the whole test order, not a single value — e.g. OGTT 75g Pregnancy, CBC Panel, Semen Analysis), "Genetic / Molecular" (DNA/gene-level test — e.g. G6PD Gene Sequencing, BRCA1, Karyotype). (string)
- notes: clinical note about this test. If relevant, include: time point (fasting/1h/2h/etc.), sample tube type (NaF/EDTA/etc.), and clinical context (pregnancy/OGTT/male fertility/etc.). Empty string if none. (string)

Return ONLY valid JSON, no markdown, no explanation.`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a medical laboratory expert. Always respond with valid JSON only." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "lab_test_field_suggestion",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  canonicalName: { type: "string" },
                  displayName: { type: "string" },
                  abbreviation: { type: "string" },
                  resultType: { type: "string" },
                  suggestedModule: { type: "string" },
                  category: { type: "string" },
                  specimen: { type: "string" },
                  commonUnits: { type: "string" },
                  canonicalUnit: { type: "string" },
                  alternativeUnits: { type: "string" },
                  conversionFactors: { type: "string" },
                  aliases: { type: "array", items: { type: "string" } },
                  analyteGroup: { type: "string" },
                  orderType: { type: "string" },
                  notes: { type: "string" },
                },
                required: ["canonicalName", "displayName", "abbreviation", "resultType", "suggestedModule", "category", "specimen", "commonUnits", "canonicalUnit", "alternativeUnits", "conversionFactors", "aliases", "analyteGroup", "orderType", "notes"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = response.choices?.[0]?.message?.content ?? "{}";
        const content = typeof rawContent === "string" ? rawContent : "{}";
        const parsed = JSON.parse(content);
        return {
          canonicalName: parsed.canonicalName ?? input.rawName,
          displayName: parsed.displayName ?? input.rawName,
          abbreviation: parsed.abbreviation ?? "",
          resultType: RESULT_TYPES.includes(parsed.resultType as any) ? parsed.resultType : "Quantitative",
          suggestedModule: SUGGESTED_MODULES.includes(parsed.suggestedModule as any) ? parsed.suggestedModule : "general_lab",
          category: parsed.category ?? "",
          specimen: parsed.specimen ?? "",
          commonUnits: parsed.commonUnits ?? "",
          canonicalUnit: parsed.canonicalUnit ?? "",
          alternativeUnits: parsed.alternativeUnits ?? "[]",
          conversionFactors: parsed.conversionFactors ?? "{}",
          aliases: Array.isArray(parsed.aliases) ? parsed.aliases.filter((a: unknown) => typeof a === "string" && a.length > 0) : [],
          analyteGroup: parsed.analyteGroup ?? "",
          orderType: (["Single Result Test", "Timed Component", "Protocol Name", "Genetic / Molecular"] as const).includes(parsed.orderType) ? parsed.orderType : "Single Result Test",
          notes: parsed.notes ?? "",
        };
      } catch (e) {
        console.error("[aiSuggestFields] AI error:", e);
        throw new Error("AI suggestion failed. Please fill fields manually.");
      }
    }),

  // ── Pending count (for badge) ─────────────────────────────────────────────
  pendingCount: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return 0;
    const [result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pendingLabTests)
      .where(eq(pendingLabTests.status, "pending"));
    return Number(result.count);
  }),

  // ── Get unit options for a test name (for unit dropdown in result entry) ────
  getUnitsByName: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { canonicalUnit: null, alternativeUnits: [], allUnits: [] };

      const q = `%${input.name.toLowerCase()}%`;
      const [entry] = await db
        .select({
          canonicalUnit: labDictionary.canonicalUnit,
          alternativeUnits: labDictionary.alternativeUnits,
          commonUnits: labDictionary.commonUnits,
        })
        .from(labDictionary)
        .where(
          and(
            eq(labDictionary.isActive, true),
            or(
              like(sql`LOWER(${labDictionary.canonicalName})`, q),
              like(sql`LOWER(${labDictionary.displayName})`, q),
              like(sql`LOWER(${labDictionary.abbreviation})`, q),
            )
          )
        )
        .limit(1);

      if (!entry) return { canonicalUnit: null, alternativeUnits: [], allUnits: [] };

      const canonicalUnit = entry.canonicalUnit ?? null;
      let alternativeUnits: string[] = [];
      try {
        if (entry.alternativeUnits) {
          alternativeUnits = JSON.parse(entry.alternativeUnits as string) as string[];
        }
      } catch { alternativeUnits = []; }

      // Build full list: canonical first, then alternatives, then commonUnits fallback
      const allUnits: string[] = [];
      if (canonicalUnit) allUnits.push(canonicalUnit);
      for (const u of alternativeUnits) {
        if (!allUnits.includes(u)) allUnits.push(u);
      }
      // Also parse commonUnits string (comma-separated) as additional options
      if (entry.commonUnits) {
        for (const u of entry.commonUnits.split(/[,;]+/).map(s => s.trim()).filter(Boolean)) {
          if (!allUnits.includes(u)) allUnits.push(u);
        }
      }

      return { canonicalUnit, alternativeUnits, allUnits };
    }),

  // ── Bulk AI Enrichment: Preview missing fields for all tests ──────────────────
  bulkEnrichPreview: protectedProcedure
    .input(z.object({
      batchSize: z.number().min(1).max(20).default(10),
      offset: z.number().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Fetch a batch of tests that have at least one missing field
      const allTests = await db
        .select({
          id: labDictionary.id,
          canonicalName: labDictionary.canonicalName,
          displayName: labDictionary.displayName,
          abbreviation: labDictionary.abbreviation,
          resultType: labDictionary.resultType,
          category: labDictionary.category,
          specimen: labDictionary.specimen,
          commonUnits: labDictionary.commonUnits,
          notes: labDictionary.notes,
          canonicalUnit: labDictionary.canonicalUnit,
          alternativeUnits: labDictionary.alternativeUnits,
          conversionFactors: labDictionary.conversionFactors,
        })
        .from(labDictionary)
        .where(eq(labDictionary.isActive, true))
        .orderBy(asc(labDictionary.canonicalName))
        .limit(input.batchSize)
        .offset(input.offset);

      const aliasMap = new Map<number, string[]>();
      if (allTests.length > 0) {
        const ids = allTests.map(t => t.id);
        const aliases = await db
          .select({ dictionaryId: labDictionaryAliases.dictionaryId, alias: labDictionaryAliases.alias })
          .from(labDictionaryAliases)
          .where(sql`${labDictionaryAliases.dictionaryId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
        for (const a of aliases) {
          if (!aliasMap.has(a.dictionaryId)) aliasMap.set(a.dictionaryId, []);
          aliasMap.get(a.dictionaryId)!.push(a.alias);
        }
      }

      // For each test, determine what is missing and call AI
      const suggestions: Array<{
        id: number;
        canonicalName: string;
        missingFields: string[];
        suggestions: {
          aliases?: string[];
          canonicalUnit?: string;
          alternativeUnits?: string[];
          conversionFactors?: Record<string, number>;
          category?: string;
          specimen?: string;
          notes?: string;
        };
      }> = [];

      for (const test of allTests) {
        const existingAliases = aliasMap.get(test.id) ?? [];
        const missingFields: string[] = [];
        if (existingAliases.length < 3) missingFields.push("aliases");
        if (!test.canonicalUnit && test.resultType === "Quantitative") missingFields.push("canonicalUnit");
        if (!test.alternativeUnits && test.resultType === "Quantitative") missingFields.push("alternativeUnits");
        if (!test.category) missingFields.push("category");
        if (!test.specimen) missingFields.push("specimen");
        if (!test.notes) missingFields.push("notes");
        if (!(test as any).analyteGroup) missingFields.push("analyteGroup");
        if (!(test as any).orderType || (test as any).orderType === "Single Result Test") missingFields.push("orderType");  // re-verify even if default

        if (missingFields.length === 0) continue;

        // Build targeted prompt
        const prompt = `You are a medical laboratory expert. For the lab test "${test.canonicalName}" (${test.abbreviation || ""}, type: ${test.resultType || "Quantitative"}), fill in ONLY the missing fields listed below. Do not change existing values.

Existing data:
- Aliases already present: ${existingAliases.join(", ") || "none"}
- Category: ${test.category || "missing"}
- Specimen: ${test.specimen || "missing"}
- Canonical unit: ${test.canonicalUnit || "missing"}

Missing fields to fill: ${missingFields.join(", ")}

Rules:
- aliases: provide at least 10 common alternative names, abbreviations, and synonyms used in Turkish labs. Include full name variants, abbreviations, plural/singular forms, hyphen variants, OCR-common variants, Turkish lab name variants. If some already exist, add only NEW ones not already present (total including existing should reach at least 10).
- canonicalUnit: the single standard unit used in Turkish clinical labs (e.g. "mg/dL", "mIU/L"). Empty string if not applicable.
- alternativeUnits: JSON array of other units seen in Turkish labs (e.g. ["mmol/L"]). Empty array if none.
- conversionFactors: JSON object mapping each alternative unit to multiplication factor to get canonical (e.g. {"mmol/L": 38.67}). Empty object if none.
- category: e.g. "Hematology", "Biochemistry", "Hormones", "Coagulation", "Immunology", "Microbiology", "Genetics"
- specimen: e.g. "Blood", "Urine", "Semen", "Serum", "Plasma"
- notes: clinical note about this test. If relevant, include time point (fasting/1h/2h), sample tube (NaF/EDTA), and clinical context (pregnancy/OGTT). Empty string if none.
- analyteGroup: the medical analyte family this test belongs to. Examples: "Glucose / OGTT", "Thyroid", "CBC", "Testosterone", "Reproductive Hormones", "Lipid Panel", "Liver Function", "Kidney Function", "Coagulation", "Tumor Markers", "Vitamins", "Electrolytes", "Infectious Disease", "Autoimmune", "Genetics". Use a concise group name.
- orderType: must be exactly one of: "Single Result Test", "Timed Component", "Protocol Name", "Genetic / Molecular".

Return ONLY valid JSON with keys for the missing fields only.`;

        try {
          const res = await invokeLLM({
            messages: [
              { role: "system", content: "You are a medical laboratory expert. Always respond with valid JSON only." },
              { role: "user", content: prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "enrich_result",
                strict: false,
                schema: {
                  type: "object",
                  properties: {
                    aliases: { type: "array", items: { type: "string" } },
                    canonicalUnit: { type: "string" },
                    alternativeUnits: { type: "array", items: { type: "string" } },
                    conversionFactors: { type: "object" },
                    category: { type: "string" },
                    specimen: { type: "string" },
                    notes: { type: "string" },
                    analyteGroup: { type: "string" },
                    orderType: { type: "string" },
                  },
                  additionalProperties: false,
                },
              },
            },
          });
          const content = res.choices?.[0]?.message?.content;
          const parsed = typeof content === "string" ? JSON.parse(content) : content;
          suggestions.push({
            id: test.id,
            canonicalName: test.canonicalName,
            missingFields,
            suggestions: parsed,
          });
        } catch {
          // Skip this test if AI fails
        }
      }

      // Get total count of tests that need enrichment
      const [totalRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(labDictionary)
        .where(eq(labDictionary.isActive, true));
      const totalTests = Number(totalRow.count);

      return { suggestions, totalTests, batchSize: input.batchSize, offset: input.offset };
    }),

  // ── Bulk AI Enrichment: Apply approved suggestions ───────────────────────
  bulkEnrichApply: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        id: z.number(),
        applyAliases: z.array(z.string()).optional(),
        canonicalUnit: z.string().optional(),
        alternativeUnits: z.array(z.string()).optional(),
        conversionFactors: z.record(z.string(), z.number()).optional(),
        category: z.string().optional(),
        specimen: z.string().optional(),
        notes: z.string().optional(),
        analyteGroup: z.string().optional(),
        orderType: z.enum(["Single Result Test", "Timed Component", "Protocol Name", "Genetic / Molecular"]).optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      let appliedCount = 0;
      let aliasesAdded = 0;

      for (const item of input.items) {
        // Update main fields
        const updateData: Record<string, unknown> = {};
        if (item.canonicalUnit !== undefined) updateData.canonicalUnit = item.canonicalUnit;
        if (item.alternativeUnits !== undefined) updateData.alternativeUnits = JSON.stringify(item.alternativeUnits);
        if (item.conversionFactors !== undefined) updateData.conversionFactors = JSON.stringify(item.conversionFactors);
        if (item.category !== undefined) updateData.category = item.category;
        if (item.specimen !== undefined) updateData.specimen = item.specimen;
        if (item.notes !== undefined) updateData.notes = item.notes;
        if (item.analyteGroup !== undefined) updateData.analyteGroup = item.analyteGroup;
        if (item.orderType !== undefined) updateData.orderType = item.orderType;

        if (Object.keys(updateData).length > 0) {
          await db.update(labDictionary).set(updateData).where(eq(labDictionary.id, item.id));
        }

        // Add new aliases (avoid duplicates)
        if (item.applyAliases && item.applyAliases.length > 0) {
          const existing = await db
            .select({ alias: labDictionaryAliases.alias })
            .from(labDictionaryAliases)
            .where(eq(labDictionaryAliases.dictionaryId, item.id));
          const existingSet = new Set(existing.map(e => e.alias.toLowerCase()));
          const newAliases = item.applyAliases.filter(a => !existingSet.has(a.toLowerCase()));
          for (const alias of newAliases) {
            await db.insert(labDictionaryAliases).values({
              dictionaryId: item.id,
              alias,
              scope: "global",
            });
            aliasesAdded++;
          }
        }

        appliedCount++;
      }

      return { appliedCount, aliasesAdded };
    }),

  // ── Change History ────────────────────────────────────────────────────────
  getChangeHistory: protectedProcedure
    .input(z.object({
      dictionaryId: z.number(),
      limit: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(labDictionaryChangelog)
        .where(eq(labDictionaryChangelog.dictionaryId, input.dictionaryId))
        .orderBy(desc(labDictionaryChangelog.createdAt))
        .limit(input.limit);
      return rows;
    }),

  // ── Undo Change ───────────────────────────────────────────────────────────
  undoChange: protectedProcedure
    .input(z.object({ changeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const [change] = await db
        .select()
        .from(labDictionaryChangelog)
        .where(eq(labDictionaryChangelog.id, input.changeId))
        .limit(1);
      if (!change) throw new Error("Change not found");
      if (change.isUndone) throw new Error("Change already undone");

      if (change.changeType === "alias_added") {
        // Remove the alias that was added
        if (change.aliasId) {
          await db.delete(labDictionaryAliases).where(eq(labDictionaryAliases.id, change.aliasId));
        } else if (change.newValue) {
          // Fallback: find by alias text
          await db.delete(labDictionaryAliases).where(
            and(
              eq(labDictionaryAliases.dictionaryId, change.dictionaryId),
              eq(labDictionaryAliases.alias, change.newValue)
            )
          );
        }
      } else if (change.changeType === "alias_removed") {
        // Re-add the alias that was removed
        if (change.oldValue) {
          await db.insert(labDictionaryAliases).values({
            dictionaryId: change.dictionaryId,
            alias: change.oldValue,
            scope: "global",
            confirmedById: ctx.user.id,
            confirmedAt: new Date(),
          });
        }
      } else if (change.changeType === "updated" && change.fieldName && change.oldValue !== null) {
        // Restore the old field value
        await db
          .update(labDictionary)
          .set({ [change.fieldName]: change.oldValue || null, updatedById: ctx.user.id })
          .where(eq(labDictionary.id, change.dictionaryId));
      }

      // Mark as undone
      await db
        .update(labDictionaryChangelog)
        .set({ isUndone: true })
        .where(eq(labDictionaryChangelog.id, input.changeId));

      return { success: true };
    }),

  // ── Backfill Changelog ───────────────────────────────────────────────────────
  // Creates "created" entries for all existing tests that have no changelog record,
  // and "alias_added" entries for all their existing aliases.
  // Safe to run multiple times — skips tests that already have changelog entries.
  backfillChangelog: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Find all dictionary IDs that already have at least one changelog entry
      const existingLogs = await db
        .select({ dictionaryId: labDictionaryChangelog.dictionaryId })
        .from(labDictionaryChangelog)
        .groupBy(labDictionaryChangelog.dictionaryId);
      const alreadyLogged = new Set(existingLogs.map(r => r.dictionaryId));

      // Fetch all dictionary entries
      const allEntries = await db
        .select({
          id: labDictionary.id,
          canonicalName: labDictionary.canonicalName,
          createdAt: labDictionary.createdAt,
          createdById: labDictionary.createdById,
        })
        .from(labDictionary);

      // Fetch all aliases
      const allAliases = await db
        .select()
        .from(labDictionaryAliases);
      const aliasesByDict = new Map<number, typeof allAliases>();
      for (const alias of allAliases) {
        if (!aliasesByDict.has(alias.dictionaryId)) aliasesByDict.set(alias.dictionaryId, []);
        aliasesByDict.get(alias.dictionaryId)!.push(alias);
      }

      let entriesBackfilled = 0;
      let aliasesBackfilled = 0;

      for (const entry of allEntries) {
        if (alreadyLogged.has(entry.id)) continue;

        // Insert "created" log using the entry's original createdAt timestamp
        await db.insert(labDictionaryChangelog).values({
          dictionaryId: entry.id,
          changeType: "created",
          newValue: JSON.stringify({ canonicalName: entry.canonicalName }),
          performedById: entry.createdById ?? undefined,
          performedByName: "(backfilled)",
          createdAt: entry.createdAt,
        });
        entriesBackfilled++;

        // Insert "alias_added" logs for each existing alias
        const aliases = aliasesByDict.get(entry.id) ?? [];
        for (const alias of aliases) {
          await db.insert(labDictionaryChangelog).values({
            dictionaryId: entry.id,
            changeType: "alias_added",
            newValue: alias.alias,
            aliasId: alias.id,
            performedById: alias.confirmedById ?? undefined,
            performedByName: "(backfilled)",
            createdAt: alias.confirmedAt ?? entry.createdAt,
          });
          aliasesBackfilled++;
        }
      }

      return { entriesBackfilled, aliasesBackfilled };
    }),

  // ── Smart Match: Verify Medical Similarity (AI, on-demand, cached) ──────────
  verifyMedicalMatch: protectedProcedure
    .input(z.object({ pendingId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const [pending] = await db.select().from(pendingLabTests).where(eq(pendingLabTests.id, input.pendingId)).limit(1);
      if (!pending) throw new Error("Pending test not found");

      // Return cached result if already computed
      if (pending.medicalVerdict) {
        return {
          verdict: pending.medicalVerdict,
          confidence: pending.confidenceScore ?? 0,
          reason: pending.medicalReason ?? "",
          suggestedAction: pending.suggestedAction ?? "",
        };
      }

      if (!pending.possibleMatchId) {
        return { verdict: "unclear" as const, confidence: 0, reason: "No possible match to compare.", suggestedAction: "Approve as new or reject." };
      }

      // Fetch the full dictionary entry for context
      const [dictEntry] = await db.select().from(labDictionary).where(eq(labDictionary.id, pending.possibleMatchId)).limit(1);
      const dictAliases = dictEntry ? await db.select().from(labDictionaryAliases).where(eq(labDictionaryAliases.dictionaryId, dictEntry.id)) : [];

      const dictContext = dictEntry ? JSON.stringify({
        canonicalName: dictEntry.canonicalName,
        displayName: dictEntry.displayName,
        abbreviation: dictEntry.abbreviation,
        resultType: dictEntry.resultType,
        category: dictEntry.category,
        specimen: dictEntry.specimen,
        commonUnits: dictEntry.commonUnits,
        canonicalUnit: dictEntry.canonicalUnit,
        alternativeUnits: dictEntry.alternativeUnits,
        analyteGroup: (dictEntry as any).analyteGroup ?? null,
        orderType: (dictEntry as any).orderType ?? "Single Result Test",
        notes: dictEntry.notes,
        aliases: dictAliases.map(a => a.alias),
      }) : "{}";

      const prompt = `You are a medical laboratory expert. Compare these two lab tests and determine if they are the same test, different tests, related but separate, or unclear.

Pending test name: "${pending.rawName}"

Suggested dictionary match:
${dictContext}

Consider:
- Canonical name, display name, abbreviation, aliases/synonyms
- Result type (quantitative/qualitative/calculated)
- Category and specimen type
- Common units
- Whether the test is direct or calculated
- Whether it is total/free/bioavailable/ratio
- Whether it is serum/plasma/urine/blood gas
- Whether it is fasting/random/timed
- Clinical context
- IMPORTANT: analyteGroup — if both tests belong to the same analyte group but have different names (e.g. "Glucose Fasting" and "Glucose 2 Hour" both in "Glucose / OGTT"), they are related_separate, NOT same. Do NOT suggest merging them as aliases.
- IMPORTANT: orderType — if the dictionary entry is a "Protocol Name" (e.g. "OGTT 75g Pregnancy", "CBC Panel") and the pending test is a single result, they are DIFFERENT. Never merge a Protocol Name with a Single Result Test.
- IMPORTANT: if orderType is "Timed Component", the test is one measurement within a timed protocol. It should only be merged with another Timed Component of the exact same time point and analyte.

Return JSON with exactly these fields:
{
  "verdict": "same" | "different" | "related_separate" | "unclear",
  "confidence": <integer 0-100>,
  "reason": "<one to three sentences of medical reasoning>",
  "suggestedAction": "<one sentence recommended action for the admin>"
}

Verdicts:
- "same": The pending test is medically identical to the dictionary test (e.g., TSH = Thyroid Stimulating Hormone, or Glucose Fasting = Fasting Blood Glucose)
- "different": They are clearly different measurements (e.g., Bioavailable Testosterone ≠ Total Testosterone, or OGTT 75g ≠ Glucose Fasting)
- "related_separate": Same analyte group but different time point or fraction — keep separate but group together in patient display (e.g., Glucose 1h vs Glucose 2h, Free T3 vs Total T3)
- "unclear": Cannot safely decide without more context

Confidence: 95-100 = almost certain, 85-94 = strong suggestion, 70-84 = related/unclear, <70 = needs human review.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a medical laboratory expert. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "medical_verification",
            strict: true,
            schema: {
              type: "object",
              properties: {
                verdict: { type: "string", enum: ["same", "different", "related_separate", "unclear"] },
                confidence: { type: "integer" },
                reason: { type: "string" },
                suggestedAction: { type: "string" },
              },
              required: ["verdict", "confidence", "reason", "suggestedAction"],
              additionalProperties: false,
            },
          },
        },
      });

      const raw = response.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)) as {
        verdict: "same" | "different" | "related_separate" | "unclear";
        confidence: number;
        reason: string;
        suggestedAction: string;
      };

      // Cache the result
      await db.update(pendingLabTests).set({
        medicalVerdict: parsed.verdict,
        confidenceScore: Math.min(100, Math.max(0, parsed.confidence)),
        medicalReason: parsed.reason,
        suggestedAction: parsed.suggestedAction,
      }).where(eq(pendingLabTests.id, input.pendingId));

      return {
        verdict: parsed.verdict,
        confidence: parsed.confidence,
        reason: parsed.reason,
        suggestedAction: parsed.suggestedAction,
      };
    }),

  // ── Smart Match: Verify a manually-selected match (no caching) ─────────────
  verifyManualMatch: protectedProcedure
    .input(z.object({ pendingId: z.number(), dictionaryId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const [pending] = await db.select().from(pendingLabTests).where(eq(pendingLabTests.id, input.pendingId)).limit(1);
      if (!pending) throw new Error("Pending test not found");

      const [dictEntry] = await db.select().from(labDictionary).where(eq(labDictionary.id, input.dictionaryId)).limit(1);
      if (!dictEntry) throw new Error("Dictionary entry not found");
      const dictAliases = await db.select().from(labDictionaryAliases).where(eq(labDictionaryAliases.dictionaryId, dictEntry.id));

      const dictContext = JSON.stringify({
        canonicalName: dictEntry.canonicalName,
        displayName: dictEntry.displayName,
        abbreviation: dictEntry.abbreviation,
        resultType: dictEntry.resultType,
        category: dictEntry.category,
        specimen: dictEntry.specimen,
        commonUnits: dictEntry.commonUnits,
        canonicalUnit: dictEntry.canonicalUnit,
        alternativeUnits: dictEntry.alternativeUnits,
        analyteGroup: (dictEntry as any).analyteGroup ?? null,
        orderType: (dictEntry as any).orderType ?? "Single Result Test",
        notes: dictEntry.notes,
        aliases: dictAliases.map(a => a.alias),
      });

      const prompt = `You are a medical laboratory expert. Compare these two lab tests and determine if they are the same test, different tests, related but separate, or unclear.

Pending test name: "${pending.rawName}"

Manually selected dictionary match:
${dictContext}

Consider:
- Canonical name, display name, abbreviation, aliases/synonyms
- Result type (quantitative/qualitative/calculated)
- Category and specimen type
- Common units
- Whether the test is direct or calculated
- Whether it is total/free/bioavailable/ratio
- Whether it is serum/plasma/urine/blood gas
- Whether it is fasting/random/timed
- Clinical context
- IMPORTANT: analyteGroup — if both tests belong to the same analyte group but have different names, they are related_separate, NOT same.
- IMPORTANT: orderType — if the dictionary entry is a "Protocol Name" and the pending test is a single result, they are DIFFERENT.

Return JSON with exactly these fields:
{
  "verdict": "same" | "different" | "related_separate" | "unclear",
  "confidence": <integer 0-100>,
  "reason": "<one to three sentences of medical reasoning>",
  "suggestedAction": "<one sentence recommended action for the admin>"
}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a medical laboratory expert. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "medical_verification",
            strict: true,
            schema: {
              type: "object",
              properties: {
                verdict: { type: "string", enum: ["same", "different", "related_separate", "unclear"] },
                confidence: { type: "integer" },
                reason: { type: "string" },
                suggestedAction: { type: "string" },
              },
              required: ["verdict", "confidence", "reason", "suggestedAction"],
              additionalProperties: false,
            },
          },
        },
      });

      const raw = response.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)) as {
        verdict: "same" | "different" | "related_separate" | "unclear";
        confidence: number;
        reason: string;
        suggestedAction: string;
      };

      return {
        verdict: parsed.verdict,
        confidence: Math.min(100, Math.max(0, parsed.confidence)),
        reason: parsed.reason,
        suggestedAction: parsed.suggestedAction,
      };
    }),

  // ── Smart Match: Get full dictionary entry for preview ───────────────────────
  getFullDictEntry: protectedProcedure
    .input(z.object({ dictionaryId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const [entry] = await db.select().from(labDictionary).where(eq(labDictionary.id, input.dictionaryId)).limit(1);
      if (!entry) return null;
      const aliases = await db.select().from(labDictionaryAliases).where(eq(labDictionaryAliases.dictionaryId, input.dictionaryId));
      const changelog = await db.select().from(labDictionaryChangelog)
        .where(eq(labDictionaryChangelog.dictionaryId, input.dictionaryId))
        .orderBy(desc(labDictionaryChangelog.createdAt))
        .limit(10);
      return { entry, aliases, changelog };
    }),

  // ── Smart Match: Confirm as Alias (merge pending → existing dict entry) ──────
  confirmAsAlias: protectedProcedure
    .input(z.object({
      pendingId: z.number(),
      dictionaryId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const [pending] = await db.select().from(pendingLabTests).where(eq(pendingLabTests.id, input.pendingId)).limit(1);
      if (!pending) throw new Error("Pending test not found");

      const [aliasResult] = await db.insert(labDictionaryAliases).values({
        dictionaryId: input.dictionaryId,
        alias: pending.rawName,
        scope: "global",
        confirmedById: ctx.user.id,
        confirmedAt: new Date(),
      });
      await db.insert(labDictionaryChangelog).values({
        dictionaryId: input.dictionaryId,
        changeType: "alias_added",
        newValue: pending.rawName,
        aliasId: (aliasResult as any).insertId,
        performedById: ctx.user.id,
        performedByName: ctx.user.name ?? undefined,
      });
      await db.update(pendingLabTests).set({
        status: "merged",
        mergedIntoDictionaryId: input.dictionaryId,
        reviewedById: ctx.user.id,
        reviewedAt: new Date(),
      }).where(eq(pendingLabTests.id, input.pendingId));
      return { success: true };
    }),

  // ── Smart Match: Reject suggested match (keep pending open for re-decision) ──
  rejectSuggestedMatch: protectedProcedure
    .input(z.object({ pendingId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      // Clear the suggested match so admin can pick another or approve as new
      // Must use null (not undefined) — Drizzle skips undefined fields entirely
      await db.update(pendingLabTests).set({
        possibleMatchId: null,
        possibleMatchName: null,
        possibleMatchScore: null,
        medicalVerdict: null,
        confidenceScore: null,
        medicalReason: null,
        suggestedAction: null,
      }).where(eq(pendingLabTests.id, input.pendingId));
      return { success: true };
    }),

  // ── Smart Match: Search dictionary for alternative match ─────────────────────
  searchDictForMatch: protectedProcedure
    .input(z.object({ query: z.string().min(1), limit: z.number().default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const q = `%${input.query}%`;
      const results = await db.select({
        id: labDictionary.id,
        canonicalName: labDictionary.canonicalName,
        displayName: labDictionary.displayName,
        abbreviation: labDictionary.abbreviation,
        resultType: labDictionary.resultType,
        category: labDictionary.category,
      }).from(labDictionary)
        .where(or(
          like(labDictionary.canonicalName, q),
          like(labDictionary.displayName, q),
          like(labDictionary.abbreviation, q),
        ))
        .orderBy(asc(labDictionary.canonicalName))
        .limit(input.limit);
      return results;
    }),

});

// ── Result type descriptions ──────────────────────────────────────────────────
const RESULT_TYPE_DESCRIPTIONS: Record<string, string> = {
  Quantitative: "Numeric value with unit and reference range (e.g., FSH, TSH, Glucose)",
  Qualitative: "Positive/Negative/Reactive result (e.g., HBsAg, Anti-HCV, Rubella IgG)",
  "Molecular/PCR": "DNA/RNA detection with viral load, Ct value, genotype (e.g., HBV DNA, HCV RNA)",
  Genetic: "Mutation, genotype, carrier status, chromosomal analysis (e.g., Factor V Leiden, MTHFR)",
  "Microbiology Culture": "Growth/No growth, organism isolated, antibiogram (e.g., Urine Culture, Blood Culture)",
  "Microscopy/Parasitology": "Microscopic findings, organism seen/not seen (e.g., Stool Parasite, AFB Smear)",
  "Panel/Profile": "Multiple child tests grouped together (e.g., CBC, ENA Profile, Lipid Panel)",
  "Pathology/Biopsy": "Tissue diagnosis, macroscopic/microscopic description (e.g., Liver Biopsy)",
  "Semen Analysis": "Sperm count, motility, morphology (dedicated module)",
  "Semen DNA": "DNA fragmentation index (dedicated module)",
  "Therapeutic Drug Monitoring": "Drug level with therapeutic/toxic range (e.g., Vancomycin, Lithium)",
  "Descriptive/Report": "Free-text findings, conclusion, recommendation (e.g., Peripheral Smear, Protein Electrophoresis)",
};
