// Keep this aligned with `max_retries` for the OCR consumers in wrangler.toml and wrangler.local.toml.
// These constants must live outside the worker entrypoint: workerd treats named
// exports on the entry module as service bindings and rejects plain values.
export const OCR_QUEUE_MAX_RETRIES = 3;
export const OCR_QUEUE_MAX_DELIVERIES = OCR_QUEUE_MAX_RETRIES + 1;
export const OCR_PENDING_RECOVERY_AGE_MS = 15 * 60_000;
