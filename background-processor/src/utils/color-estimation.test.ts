import { describe, it, expect } from '@jest/globals';
import sharp from 'sharp';
import { estimateColor } from './color-estimation.js';

type Rgb = { r: number; g: number; b: number };

// A square "disc" of the given size centered on a 100x100 surface
async function discOnSurface(discColor: Rgb, discSize: number, surface: Rgb): Promise<Buffer> {
  const disc = await sharp({
    create: { width: discSize, height: discSize, channels: 3, background: discColor }
  }).png().toBuffer();

  const offset = Math.round((100 - discSize) / 2);
  return sharp({
    create: { width: 100, height: 100, channels: 3, background: surface }
  })
    .composite([{ input: disc, left: offset, top: offset }])
    .png()
    .toBuffer();
}

describe('estimateColor', () => {
  it('ignores the surface around the disc (samples only the center window)', async () => {
    // Red disc covering the central 70%, blue surface elsewhere
    const image = await discOnSurface({ r: 255, g: 0, b: 0 }, 70, { r: 0, g: 0, b: 255 });
    const color = await estimateColor(image);

    // Pure red despite ~half the image being blue surface
    expect(color.r).toBeGreaterThan(245);
    expect(color.g).toBeLessThan(10);
    expect(color.b).toBeLessThan(10);
  });

  it('samples only the inner 40%: pixels outside it do not contribute', async () => {
    // Red only in the central 50%; green from there outward. A 60% window
    // would still catch green, the 40% window must not.
    const image = await discOnSurface({ r: 255, g: 0, b: 0 }, 50, { r: 0, g: 255, b: 0 });
    const color = await estimateColor(image);

    expect(color.r).toBeGreaterThan(245);
    expect(color.g).toBeLessThan(10);
    expect(color.b).toBeLessThan(10);
  });

  it('still sees a disc that fills only the sampling window', async () => {
    // Anything smaller than the window blends with what surrounds it, so a
    // 44%-wide disc should dominate but not fully saturate the average.
    const image = await discOnSurface({ r: 255, g: 0, b: 0 }, 44, { r: 0, g: 0, b: 255 });
    const color = await estimateColor(image);

    expect(color.r).toBeGreaterThan(200);
    expect(color.r).toBeGreaterThan(color.b);
  });

  it('averages a uniform image to its own color', async () => {
    const image = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 40, g: 120, b: 200 } }
    }).png().toBuffer();

    const color = await estimateColor(image);
    expect(color).toEqual({ r: 40, g: 120, b: 200 });
  });
});
