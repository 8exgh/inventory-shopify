import sharp from 'sharp';

// Fraction of the image (centered) actually sampled: the disc sits in the
// middle of the photo, so ignoring the outer border keeps the surface it is
// lying on out of the average.
const CENTER_SAMPLE_FRACTION = 0.6;

export async function estimateColor(imageBuffer: Buffer): Promise<{ r: number; g: number; b: number }> {
  try {
    // Resize image to 100x100 for faster processing
    const resized = await sharp(imageBuffer)
      .resize(100, 100, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = resized;

    // Bounds of the centered sampling window (inner 60% per axis)
    const marginX = Math.round((info.width * (1 - CENTER_SAMPLE_FRACTION)) / 2);
    const marginY = Math.round((info.height * (1 - CENTER_SAMPLE_FRACTION)) / 2);
    const xStart = marginX;
    const xEnd = info.width - marginX;
    const yStart = marginY;
    const yEnd = info.height - marginY;

    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let pixelCount = 0;

    // Calculate average RGB over the center window only
    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        const i = (y * info.width + x) * info.channels;
        totalR += data[i];
        totalG += data[i + 1];
        totalB += data[i + 2];
        pixelCount++;
      }
    }

    return {
      r: Math.round(totalR / pixelCount),
      g: Math.round(totalG / pixelCount),
      b: Math.round(totalB / pixelCount)
    };
  } catch (error) {
    console.error('Color estimation error:', error);
    throw error;
  }
}
