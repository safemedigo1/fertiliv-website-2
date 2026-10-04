export const EXTERNAL_REPORT_FINALIZE_STAGES = [
  "input_validated",
  "source_asset_payload_prepared",
  "source_asset_size_validated",
  "source_asset_key_allocated",
  "source_asset_uploaded",
  "source_asset_upload_retry_started",
  "source_asset_retry_key_allocated",
  "source_asset_retry_uploaded",
  "source_assets_stored",
  "processing_contract_resolved",
  "transaction_started",
  "processed_document_validated",
  "report_inserted",
  "source_revision_inserted",
  "source_revision_linked",
  "processing_run_inserted",
  "transaction_committed",
  "readback_completed",
] as const;

export type ExternalReportFinalizeStage = typeof EXTERNAL_REPORT_FINALIZE_STAGES[number];
export type ExternalReportFinalizeFailureCategory = "input_validation" | "source_asset_preparation" | "source_asset_http_metadata" | "source_asset_provider_validation" | "source_asset_timeout_or_network" | "source_asset_authentication" | "source_asset_storage" | "database_or_readback" | "unknown";

/** Maps provider/storage errors to stable non-content categories; messages are never logged. */
export function classifyExternalReportSourceAssetStorageFailure(error: unknown): Extract<ExternalReportFinalizeFailureCategory, `source_asset_${string}`> {
  const candidate = error && typeof error === "object" ? error as { code?: unknown; name?: unknown; $metadata?: { httpStatusCode?: unknown } } : {};
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const status = typeof candidate.$metadata?.httpStatusCode === "number" ? candidate.$metadata.httpStatusCode : 0;

  if (code === "ERR_INVALID_CHAR" || code === "ERR_INVALID_ARG_VALUE") return "source_asset_http_metadata";
  if (status === 401 || status === 403 || code === "CredentialsProviderError") return "source_asset_authentication";
  if ([400, 411, 413, 415, 422].includes(status)) return "source_asset_provider_validation";
  if ([408, 429, 500, 502, 503, 504].includes(status) || ["AbortError", "TimeoutError", "NetworkingError", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"].includes(name) || ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"].includes(code)) return "source_asset_timeout_or_network";
  return "source_asset_storage";
}

/** Maps only stable error codes to metadata-safe categories; never log error messages. */
export function classifyExternalReportFinalizeFailure(error: unknown, stage: ExternalReportFinalizeStage): ExternalReportFinalizeFailureCategory {
  const code = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  if (code === "BAD_REQUEST" || code === "PAYLOAD_TOO_LARGE") return "input_validation";
  if (["source_asset_payload_prepared", "source_asset_size_validated", "source_asset_key_allocated"].includes(stage)) return "source_asset_preparation";
  if (["source_asset_uploaded", "source_asset_upload_retry_started", "source_asset_retry_key_allocated", "source_asset_retry_uploaded", "source_assets_stored"].includes(stage)) return classifyExternalReportSourceAssetStorageFailure(error);
  if (["transaction_started", "processed_document_validated", "report_inserted", "source_revision_inserted", "source_revision_linked", "processing_run_inserted", "transaction_committed", "readback_completed"].includes(stage)) return "database_or_readback";
  return "unknown";
}

/** Logging is deliberately best-effort so observability cannot affect Finalize behavior. */
export function logExternalReportFinalizeStage(flowId: string, stage: ExternalReportFinalizeStage, transactionStarted: boolean, transactionCommitted: boolean) {
  try {
    console.info("[ExternalReports:create]", { flowId, stage, transactionStarted, transactionCommitted });
  } catch {
    // Logging must never gate a clinical create transaction.
  }
}

export function logExternalReportFinalizeFailure(
  flowId: string,
  stage: ExternalReportFinalizeStage,
  error: unknown,
  transactionStarted: boolean,
  transactionCommitted: boolean,
) {
  try {
    console.warn("[ExternalReports:create]", {
      flowId,
      stage,
      category: classifyExternalReportFinalizeFailure(error, stage),
      transactionStarted,
      rollbackOccurred: transactionStarted && !transactionCommitted,
    });
  } catch {
    // Logging must never gate a clinical create transaction.
  }
}
