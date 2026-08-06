import { describe, it, expect } from '@jest/globals';
import sharp from 'sharp';
import { estimateColor } from './color-estimation.js';

// A red "disc" covering the central 70% of a blue background: the sampled
// inner 60% window lies entirely inside the red region.
async function discOnSurface(discColor: { r: number; g: number; b: number }, surface: { r: number; g: number; b: number }): Promise<Buffer> {
  const disc = await sharp({
    create: { width: 70, height: 70, channels: 3, background: discColor }
  }).png().toBuffer();

  return sharp({
    create: { width: 100, height: 100, channels: 3, background: surface }
  })
    .composite([{ input: disc, left: 15, top: 15 }])
    .png()
    .toBuffer();
}

describe('estimateColor', () => {
  it('ignores the surface around the disc (samples only the center window)', async () => {
    const image = await discOnSurface({ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 });
    const color = await estimateColor(image);

    // Pure red despite ~half the image being blue surface
    expect(color.r).toBeGreaterThan(245);
    expect(color.g).toBeLessThan(10);
    expect(color.b).toBeLessThan(10);
  });

  it('averages a uniform image to its own color', async () => {
    const image = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 40, g: 120, b: 200 } }
    }).png().toBuffer();

    const color = await estimateColor(image);
    expect(color).toEqual({ r: 40, g: 120, b: 200 });
  });
});
