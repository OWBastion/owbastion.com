// Worker binding declarations live apart from app.ts so env fields do not grow
// the route-registration module; declare bindings here, not in routes.
export type RuntimeEnv = {
  DB: D1Database;
  EVIDENCE_BUCKET?: R2Bucket;
  ASSETS_BUCKET?: R2Bucket;
  ASSETS_PUBLIC_ORIGIN?: string;
  QQBOT_API_TOKEN?: string;
  BASTION_BUILD_TOKEN?: string;
  PORTAL_ORIGIN?: string;
  PORTAL_PREVIEW_ORIGINS?: string;
  LOCAL_DEV_AUTH?: string;
  UPLOAD_ORIGIN?: string;
  EVIDENCE_PUBLIC_ORIGIN?: string;
  OCRKIT_BASE_URL?: string;
  OCRKIT_API_TOKEN?: string;
  OCRKIT_SNAPSHOT_TOKEN?: string;
  OCR_QUEUE?: Queue;
  QQ_POLICY_QUEUE?: Queue;
  QQBOT_POLICY_WEBHOOK_URL?: string;
  QQBOT_POLICY_WEBHOOK_SECRET?: string;
  BINDING_INVITE_CODE_ENCRYPTION_KEY?: string;
  OCR_MANUAL_REVIEW_THRESHOLD?: string;
  OCR_AUTO_REVIEW_SAMPLE_RATE?: string;
  MASTERY_MIN_GAME_VERSION?: string;
  MASTERY_SUPPORTED_OCR_LAYOUT_VERSIONS?: string;
  DEPLOYMENT_REVISION?: string;
  PUBLIC_HTTP_CACHE_ENABLED?: string;
  PLATFORM_CACHE?: KVNamespace;
  TURNSTILE_SECRET_KEY?: string;
};
