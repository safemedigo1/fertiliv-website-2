import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { ENV } from "./_core/env";
import { externalReportDocumentSchema } from "./externalReportDocument";
import { externalReportInputMethodSchema, externalReportLanguageSchema, externalReportProcessingGoalSchema, externalReportSourceLanguageSchema, resolveExternalReportProcessing } from "./externalReportProcessing";
import { assessExternalReportV2Safety, externalReportV2SafetyStates } from "./externalReportV2Safety";
import { createExternalReportV2Document } from "./externalReportV2Document";
import { hasSubstantialExternalReportV2Language } from "./externalReportV2Processing";

const proofContractSchema = z.object({
  patientId: z.number().int().positive(),
  sourceHash: z.string().length(64),
  outputHash: z.string().length(64),
  sourceLanguage: externalReportSourceLanguageSchema,
  processingGoal: externalReportProcessingGoalSchema,
  requestedTargetLanguage: z.union([externalReportLanguageSchema, z.literal("source")]).nullable(),
  resolvedOutputLanguage: externalReportSourceLanguageSchema,
  safetyState: z.enum(externalReportV2SafetyStates),
  submissionKey: z.string().uuid(),
});

export const externalReportV2FinalizeInputSchema = z.object({
  processProof: z.string().min(1),
  patientId: z.number().int().positive(),
  sourceText: z.string().min(1).max(200_000),
  originalProcessedText: z.string().min(1).max(200_000),
  processedText: z.string().min(1).max(200_000),
  title: z.string().trim().min(1).max(500).optional(),
  sourceLanguage: externalReportSourceLanguageSchema,
  processingGoal: externalReportProcessingGoalSchema,
  requestedTargetLanguage: z.union([externalReportLanguageSchema, z.literal("source")]).nullable().optional(),
  sourceOrganization: z.string().max(255).optional(),
  reportType: z.string().max(100).optional(),
  reportDate: z.date().optional(),
  sourceInputMethod: externalReportInputMethodSchema,
  sourceAssetRefs: z.array(z.object({ key: z.string(), name: z.string(), mimeType: z.string().optional() })).optional(),
  sourceAssets: z.array(z.object({
    fileBase64: z.string(), fileName: z.string().min(1).max(255), mimeType: z.string().min(1).max(128),
    tag: z.string().trim().min(1).max(120), documentPassword: z.string().max(512).optional(),
  })).max(12).optional(),
});

export type ExternalReportV2FinalizeInput = z.infer<typeof externalReportV2FinalizeInputSchema>;

export function hashExternalReportV2Value(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function signingKey() {
  if (!ENV.cookieSecret) throw new Error("V2_PROOF_UNAVAILABLE");
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createExternalReportV2ProcessProof(input: {
  actorId: number; patientId: number; sourceText: string; outputText: string;
  sourceLanguage: "en" | "ar" | "tr" | "und";
  processingGoal: "translate" | "simplify" | "translate_simplify" | "format_only" | "summarize";
  requestedTargetLanguage: "en" | "ar" | "tr" | "source" | null;
  resolvedOutputLanguage: "en" | "ar" | "tr" | "und";
  safetyState: "auto_verified" | "manual_verification_required";
}) {
  const submissionKey = randomUUID();
  const contract = proofContractSchema.parse({
    patientId: input.patientId,
    sourceHash: hashExternalReportV2Value(input.sourceText),
    outputHash: hashExternalReportV2Value(input.outputText),
    sourceLanguage: input.sourceLanguage,
    processingGoal: input.processingGoal,
    requestedTargetLanguage: input.requestedTargetLanguage,
    resolvedOutputLanguage: input.resolvedOutputLanguage,
    safetyState: input.safetyState,
    submissionKey,
  });
  const token = await new SignJWT(contract).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(String(input.actorId))
    .setJti(submissionKey).setIssuedAt().setExpirationTime("2h").sign(signingKey());
  return { processProof: token, submissionKey };
}

export async function verifyExternalReportV2ProcessProof(input: { actorId: number; proof: string }) {
  try {
    const verified = await jwtVerify(input.proof, signingKey(), { algorithms: ["HS256"] });
    if (verified.payload.sub !== String(input.actorId)) throw new Error("V2_PROOF_ACTOR_MISMATCH");
    return proofContractSchema.parse(verified.payload);
  } catch {
    throw new Error("V2_PROOF_INVALID");
  }
}

export async function validateExternalReportV2Finalize(input: ExternalReportV2FinalizeInput & { actorId: number }) {
  const proof = await verifyExternalReportV2ProcessProof({ actorId: input.actorId, proof: input.processProof });
  const requestedTargetLanguage = input.requestedTargetLanguage ?? null;
  const resolved = resolveExternalReportProcessing({ processingGoal: input.processingGoal, requestedTargetLanguage, sourceLanguage: input.sourceLanguage });
  if (proof.patientId !== input.patientId || proof.sourceHash !== hashExternalReportV2Value(input.sourceText)) throw new Error("V2_SOURCE_SNAPSHOT_MISMATCH");
  if (proof.outputHash !== hashExternalReportV2Value(input.originalProcessedText)) throw new Error("V2_ORIGINAL_OUTPUT_MISMATCH");
  if (proof.processingGoal !== resolved.processingGoal || proof.resolvedOutputLanguage !== resolved.resolvedOutputLanguage || proof.requestedTargetLanguage !== resolved.requestedTargetLanguage) {
    throw new Error("V2_PROCESSING_CONTRACT_MISMATCH");
  }
  const manuallyEdited = input.processedText !== input.originalProcessedText;
  if (!hasSubstantialExternalReportV2Language(input.processedText, resolved.resolvedOutputLanguage)) {
    throw new Error("V2_LANGUAGE_INCOMPLETE");
  }
  const safety = assessExternalReportV2Safety({ sourceText: input.sourceText, outputText: input.processedText, processingGoal: resolved.processingGoal, outputLanguage: resolved.resolvedOutputLanguage });
  const document = externalReportDocumentSchema.parse(createExternalReportV2Document({ language: resolved.resolvedOutputLanguage, title: input.title, text: input.processedText }));
  return { proof, resolved, document, safety, manuallyEdited, submissionKey: proof.submissionKey, metadata: { version: 2 as const, safetyState: safety.state, manuallyEdited } };
}
