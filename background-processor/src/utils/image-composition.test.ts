import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import sharp from 'sharp';
import { callOpenAiEdit, normalizeToCanvas, hexToRgb } from './image-composition.js';

// Mock environment variables
process.env.OPENAI_API_KEY = 'sk-test-key';
process.env.OPENAI_IMAGE_MODEL = 'gpt-image-2';
process.env.IMAGE_BACKGROUND_HEX = '#ADD8E6';
process.env.IMAGE_CANVAS_SIZE = '1024';
process.env.IMAGE_MARGIN_PX = '48';

const BACKGROUND = { r: 0xAD, g: 0xD8, b: 0xE6 };

/**
 * Builds a PNG with a solid dark disc-ish square offset towards one corner on a
 * light blue field — i.e. what a loosely-framed model response looks like.
 */
async function buildOffCenterImage(): Promise<Buffer> {
  const disc = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 200, g: 30, b: 30 } }
  }).png().toBuffer();

  return await sharp({
    create: { width: 800, height: 800, channels: 3, background: BACKGROUND }
  })
    .composite([{ input: disc, top: 60, left: 80 }])
    .png()
    .toBuffer();
}

async function cornerPixel(buffer: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

describe('hexToRgb', () => {
  it('parses a six digit hex with a leading hash', () => {
    expect(hexToRgb('#ADD8E6')).toEqual({ r: 173, g: 216, b: 230 });
  });

  it('rejects malformed hex', () => {
    expect(() => hexToRgb('#GGG')).toThrow('Invalid background hex');
  });
});

describe('normalizeToCanvas', () => {
  it('centers the disc on an exact square canvas filled with the background hex', async () => {
    // Arrange
    const offCenter = await buildOffCenterImage();

    // Act
    const result = await normalizeToCanvas(offCenter);

    // Assert
    const metadata = await sharp(result).metadata();
    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1024);

    // The margin guarantees the corners are pure background
    expect(await cornerPixel(result)).toEqual(BACKGROUND);
  });

  it('rejects a crop that is not disc shaped', async () => {
    // Arrange: a very wide bar, nothing like a round disc
    const bar = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 10, g: 10, b: 10 } }
    }).png().toBuffer();

    const wide = await sharp({
      create: { width: 800, height: 800, channels: 3, background: BACKGROUND }
    })
      .composite([{ input: await sharp(bar).resize(600, 40, { fit: 'fill' }).png().toBuffer(), top: 380, left: 100 }])
      .png()
      .toBuffer();

    // Act + Assert
    await expect(normalizeToCanvas(wide)).rejects.toThrow('does not look like a centered disc');
  });

  it('falls back to the untrimmed image when the frame is entirely background', async () => {
    // Arrange: sharp's trim would consume the whole image here
    const blank = await sharp({
      create: { width: 800, height: 800, channels: 3, background: BACKGROUND }
    }).png().toBuffer();

    // Act
    const result = await normalizeToCanvas(blank);

    // Assert
    const metadata = await sharp(result).metadata();
    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1024);
  });
});

describe('callOpenAiEdit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // No house fetch-mock pattern exists in this repo, so establish one here.
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('posts multipart to the edits endpoint and decodes the returned image', async () => {
    // Arrange
    const returned = await sharp({
      create: { width: 64, height: 64, channels: 3, background: BACKGROUND }
    }).png().toBuffer();

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: returned.toString('base64') }] })
    });

    const input = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } }
    }).jpeg().toBuffer();

    // Act
    const result = await callOpenAiEdit(input);

    // Assert
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ Authorization: 'Bearer sk-test-key' });

    const form = options.body as FormData;
    expect(form.get('model')).toBe('gpt-image-2');
    expect(form.get('size')).toBe('1024x1024');
    expect(form.get('output_format')).toBe('png');
    // Unsupported on gpt-image-2 — must never be sent
    expect(form.get('input_fidelity')).toBeNull();
    expect(form.get('background')).toBeNull();
    expect(form.get('mask')).toBeNull();
    expect(String(form.get('prompt'))).toContain('#ADD8E6');

    expect(result.equals(returned)).toBe(true);
  });

  it('throws with the response body when OpenAI returns an error', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      text: async () => '{"error":"invalid_prompt"}'
    });

    const input = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } }
    }).png().toBuffer();

    // Act + Assert
    await expect(callOpenAiEdit(input)).rejects.toThrow('OpenAI image edit failed: Bad Request - {"error":"invalid_prompt"}');
  });

  it('throws when the response contains no image data', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] })
    });

    const input = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } }
    }).png().toBuffer();

    // Act + Assert
    await expect(callOpenAiEdit(input)).rejects.toThrow('returned no image data');
  });
});
