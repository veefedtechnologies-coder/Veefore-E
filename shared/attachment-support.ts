/**
 * attachment-support — the ONE list of file types VeeGPT chat accepts.
 *
 * Imported by both the composer (client) and the chat route (server) so the two
 * can never disagree. They previously had separate hardcoded lists, which is how
 * HEIC ended up half-supported: the picker filtered it out silently, the user got
 * no message, and the send did nothing.
 *
 * Adding a type here is not enough on its own — check the capability notes below,
 * because not every model can read every format.
 */

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB per file (images/HEIC/PDF)
/**
 * Videos get a much higher ceiling than images: the server `/attachments/upload`
 * route accepts up to 200MB (see veegpt-chat.routes.ts `ATTACHMENT_MAX_BYTES`),
 * so the client MUST allow the same or a normal phone video (40–150MB) is
 * rejected client-side with a misleading "max 25MB" before it ever uploads.
 * Keep this in sync with the server limit.
 */
export const MAX_VIDEO_ATTACHMENT_BYTES = 200 * 1024 * 1024; // 200MB per video

/** The per-file byte ceiling for a given attachment kind. */
export function maxBytesForKind(kind: AttachmentKind | null): number {
  return kind === 'video' ? MAX_VIDEO_ATTACHMENT_BYTES : MAX_ATTACHMENT_BYTES;
}

/** Images every vision model can read. */
export const IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg', // some browsers report this for .jpg
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/**
 * Apple's HEIC/HEIF. Gemini reads these natively via inlineData; OpenAI chat
 * models do NOT, so they route to Gemini as a capability substitution (see
 * ai-model-routing.ts, capability 'heic').
 */
export const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence'] as const;

/** Video. Only Gemini can read video at all. */
export const VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime', // .mov
  'video/webm',
  'video/x-m4v',
] as const;

/** Documents. Gemini only. */
export const DOCUMENT_TYPES = ['application/pdf'] as const;

export const ALL_SUPPORTED_TYPES: string[] = [
  ...IMAGE_TYPES,
  ...HEIC_TYPES,
  ...VIDEO_TYPES,
  ...DOCUMENT_TYPES,
];

/** For an <input accept="…"> attribute. Extensions are included because some
 *  browsers report an EMPTY File.type for .heic/.mov, and then only the extension
 *  lets the picker show the file at all. */
export const ACCEPT_IMAGES = [...IMAGE_TYPES, ...HEIC_TYPES, '.heic', '.heif'].join(',');
export const ACCEPT_VIDEOS = [...VIDEO_TYPES, '.mov', '.mp4', '.m4v'].join(',');
export const ACCEPT_MEDIA = `${ACCEPT_IMAGES},${ACCEPT_VIDEOS}`;
export const ACCEPT_DOCUMENTS = [...DOCUMENT_TYPES, '.pdf'].join(',');

/**
 * Best-effort MIME type for a file.
 *
 * Browsers are inconsistent: Chrome on macOS reports `''` for .heic, and some
 * report `''` for .mov too. Falling back to the extension is what stops a valid
 * file being rejected (or worse, silently dropped) for having no type.
 */
export function resolveMimeType(name: string, declaredType?: string): string {
  const declared = (declaredType || '').toLowerCase().trim();
  if (declared && declared !== 'application/octet-stream') return declared;

  const ext = (name.split('.').pop() || '').toLowerCase();
  const byExt: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
    pdf: 'application/pdf',
  };
  return byExt[ext] || declared || '';
}

export type AttachmentKind = 'image' | 'heic' | 'video' | 'document';

export function kindOf(mimeType: string): AttachmentKind | null {
  const t = (mimeType || '').toLowerCase();
  if ((HEIC_TYPES as readonly string[]).includes(t)) return 'heic';
  if ((IMAGE_TYPES as readonly string[]).includes(t)) return 'image';
  if ((VIDEO_TYPES as readonly string[]).includes(t)) return 'video';
  if ((DOCUMENT_TYPES as readonly string[]).includes(t)) return 'document';
  return null;
}

export function isSupportedType(mimeType: string): boolean {
  return kindOf(mimeType) !== null;
}

/** Human list for error messages. */
export const SUPPORTED_SUMMARY = 'JPG, PNG, HEIC, WEBP, GIF, MP4, MOV or PDF';

export interface RejectedFile {
  name: string;
  reason: string;
}

export interface ValidationResult<T> {
  accepted: T[];
  rejected: RejectedFile[];
}

/**
 * Validate picked files. NEVER throws — an unsupported or oversized file becomes
 * a `rejected` entry with a reason to show the user, which is the whole point:
 * the old code filtered silently and the send then did nothing at all.
 */
export function validateAttachments<
  T extends { name: string; type?: string; size?: number },
>(files: T[], alreadyAttached = 0): ValidationResult<T> {
  const accepted: T[] = [];
  const rejected: RejectedFile[] = [];

  for (const f of files) {
    const mime = resolveMimeType(f.name, f.type);

    if (!isSupportedType(mime)) {
      const ext = (f.name.split('.').pop() || '').toUpperCase();
      rejected.push({
        name: f.name,
        reason: `${ext || 'This'} files aren't supported. Use ${SUPPORTED_SUMMARY}.`,
      });
      continue;
    }
    // Per-kind size cap: videos are allowed up to the server's 200MB limit,
    // images/HEIC/PDF stay at 25MB.
    const maxBytes = maxBytesForKind(kindOf(mime));
    if (typeof f.size === 'number' && f.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      rejected.push({
        name: f.name,
        reason: `Too large (max ${mb}MB).`,
      });
      continue;
    }
    if (accepted.length + alreadyAttached >= MAX_ATTACHMENTS) {
      rejected.push({
        name: f.name,
        reason: `You can attach up to ${MAX_ATTACHMENTS} files.`,
      });
      continue;
    }
    accepted.push(f);
  }

  return { accepted, rejected };
}
