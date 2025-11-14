import sharp from 'sharp';

export async function estimateColor(imageBuffer: Buffer): Promise<{ r: number; g: number; b: number }> {
  try {
    // Resize image to 100x100 for faster processing
    const resized = await sharp(imageBuffer)
      .resize(100, 100, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = resized;
    const pixelCount = info.width * info.height;

    let totalR = 0;
    let totalG = 0;
    let totalB = 0;

    // Calculate average RGB
    for (let i = 0; i < data.length; i += info.channels) {
      totalR += data[i];
      totalG += data[i + 1];
      totalB += data[i + 2];
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
