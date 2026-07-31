import sharp from 'sharp';

const OPENAI_EDITS_URL = 'https://api.openai.com/v1/images/edits';

function getOpenAiApiKey(): string {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  return OPENAI_API_KEY;
}

export function getOpenAiImageModel(): string {
  const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  return OPENAI_IMAGE_MODEL;
}

export function getBackgroundHex(): string {
  const IMAGE_BACKGROUND_HEX = process.env.IMAGE_BACKGROUND_HEX || '#ADD8E6';
  return IMAGE_BACKGROUND_HEX;
}

export function getCanvasSize(): number {
  const IMAGE_CANVAS_SIZE = parseInt(process.env.IMAGE_CANVAS_SIZE || '1024', 10);
  return IMAGE_CANVAS_SIZE;
}

function getMarginPx(): number {
  const IMAGE_MARGIN_PX = parseInt(process.env.IMAGE_MARGIN_PX || '48', 10);
  return IMAGE_MARGIN_PX;
}

function getTrimThreshold(): number {
  const IMAGE_TRIM_THRESHOLD = parseInt(process.env.IMAGE_TRIM_THRESHOLD || '20', 10);
  return IMAGE_TRIM_THRESHOLD;
}

/**
 * Converts #RRGGBB to the {r,g,b} object sharp expects for background fills.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid background hex: ${hex}`);
  }
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function buildPrompt(backgroundHex: string): string {
  return [
    'Place the disc golf disc exactly in the center of a square frame.',
    `Replace everything around the disc with a solid, uniform light blue background (${backgroundHex}).`,
    'Preserve the disc itself exactly: keep its original colors, stamp artwork, and all text unchanged.',
    'No shadows, gradients, reflections, borders, text, or added objects.'
  ].join(' ');
}

/**
 * Sends the original photo to OpenAI's image edit endpoint and returns the
 * edited PNG.
 *
 * Deliberately omits `mask` (masking on this endpoint is prompt-based and not
 * shape-precise; normalizeToCanvas handles geometry instead), `input_fidelity`
 * (gpt-image-2 rejects changes to it and treats all input at high fidelity),
 * and `background: transparent` (unsupported on gpt-image-2).
 */
export async function callOpenAiEdit(imageBuffer: Buffer): Promise<Buffer> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not defined');
  }

  const size = getCanvasSize();

  // Normalize to PNG so the upload mime type is always known, regardless of
  // whether the restocker's phone produced JPEG, HEIC-derived JPEG, or WebP.
  const pngInput = await sharp(imageBuffer).png().toBuffer();

  const form = new FormData();
  form.append('model', getOpenAiImageModel());
  form.append('prompt', buildPrompt(getBackgroundHex()));
  form.append('size', `${size}x${size}`);
  form.append('output_format', 'png');
  form.append('n', '1');
  form.append('image', new Blob([new Uint8Array(pngInput)], { type: 'image/png' }), 'disc.png');

  const response = await fetch(OPENAI_EDITS_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI image edit failed: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json() as any;
  const b64 = data?.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error('OpenAI image edit returned no image data');
  }

  return Buffer.from(b64, 'base64');
}

/**
 * Deterministic guardrail around the generative step.
 *
 * The model will not center to the pixel and its "light blue" drifts between
 * images, so we trim the flat background back to the disc's bounding box and
 * re-center that on an exact canvas filled with the configured hex. Centering,
 * background color, size, and margin are therefore exact no matter how loosely
 * the model framed the shot.
 */
export async function normalizeToCanvas(pngBuffer: Buffer): Promise<Buffer> {
  const size = getCanvasSize();
  const margin = getMarginPx();
  const background = hexToRgb(getBackgroundHex());

  if (margin * 2 >= size) {
    throw new Error(`IMAGE_MARGIN_PX (${margin}) is too large for IMAGE_CANVAS_SIZE (${size})`);
  }

  let discBuffer: Buffer;
  try {
    discBuffer = await sharp(pngBuffer)
      .trim({ background: getBackgroundHex(), threshold: getTrimThreshold() })
      .toBuffer();
  } catch {
    // sharp throws when trimming would consume the whole image (i.e. it is
    // entirely background). Fall back to the untrimmed edit rather than failing.
    discBuffer = pngBuffer;
  }

  const trimmed = await sharp(discBuffer).metadata();
  if (trimmed.width && trimmed.height) {
    const aspectRatio = trimmed.width / trimmed.height;
    // A disc is round, so its bounding box is close to square. A wildly
    // non-square crop means the trim latched onto something else.
    if (aspectRatio < 0.5 || aspectRatio > 2) {
      throw new Error(
        `Processed image does not look like a centered disc (bounding box ${trimmed.width}x${trimmed.height})`
      );
    }
  }

  const inner = size - margin * 2;

  return await sharp(discBuffer)
    .resize(inner, inner, { fit: 'contain', background })
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background })
    .png()
    .toBuffer();
}
