const trustedHostSuffixes = ["qq.com", "qq.com.cn", "qpic.cn"];
const maxRedirects = 3;
const fetchTimeoutMs = 10_000;

export const qqAttachmentMaxBytes = 10 * 1024 * 1024;

const imageSignatures = [
  { contentType: "image/jpeg", extension: "jpg", matches: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { contentType: "image/png", extension: "png", matches: (b: Uint8Array) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => b[index] === value) },
  { contentType: "image/webp", extension: "webp", matches: (b: Uint8Array) => [0x52, 0x49, 0x46, 0x46].every((value, index) => b[index] === value) && [0x57, 0x45, 0x42, 0x50].every((value, index) => b[8 + index] === value) },
] as const;

export type QqAttachmentImage = { body: ArrayBuffer; contentType: (typeof imageSignatures)[number]["contentType"]; extension: (typeof imageSignatures)[number]["extension"] };

const assertTrustedUrl = (value: string) => {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("SOURCE_ATTACHMENT_UNAVAILABLE"); }
  const host = url.hostname.toLowerCase();
  const trusted = trustedHostSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !trusted) throw new Error("SOURCE_ATTACHMENT_UNAVAILABLE");
  return url;
};

const readBounded = async (response: Response) => {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > qqAttachmentMaxBytes) throw new Error("ATTACHMENT_SIZE_INVALID");
  if (!response.body) throw new Error("SOURCE_ATTACHMENT_UNAVAILABLE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > qqAttachmentMaxBytes) { await reader.cancel(); throw new Error("ATTACHMENT_SIZE_INVALID"); }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
};

export const fetchQqAttachmentImage = async (sourceUrl: string): Promise<QqAttachmentImage> => {
  let url = assertTrustedUrl(sourceUrl);
  const signal = AbortSignal.timeout(fetchTimeoutMs);
  try {
    for (let redirects = 0; ; redirects += 1) {
      const response = await fetch(url, { redirect: "manual", signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects >= maxRedirects) throw new Error("SOURCE_ATTACHMENT_UNAVAILABLE");
        url = assertTrustedUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new Error("SOURCE_ATTACHMENT_UNAVAILABLE");
      const bytes = await readBounded(response);
      const image = imageSignatures.find((signature) => signature.matches(bytes));
      if (!image) throw new Error("UNSUPPORTED_ATTACHMENT_TYPE");
      return { body: bytes.buffer as ArrayBuffer, contentType: image.contentType, extension: image.extension };
    }
  } catch (error) {
    if (error instanceof Error && ["SOURCE_ATTACHMENT_UNAVAILABLE", "ATTACHMENT_SIZE_INVALID", "UNSUPPORTED_ATTACHMENT_TYPE"].includes(error.message)) throw error;
    throw new Error("SOURCE_ATTACHMENT_UNAVAILABLE");
  }
};
