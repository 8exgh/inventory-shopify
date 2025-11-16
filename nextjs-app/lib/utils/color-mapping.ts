export const COLOR_REFERENCES = {
  'Red': { r: 255, g: 0, b: 0 },
  'Orange': { r: 255, g: 165, b: 0 },
  'Yellow': { r: 255, g: 255, b: 0 },
  'Green': { r: 0, g: 255, b: 0 },
  'Blue': { r: 0, g: 0, b: 255 },
  'Purple': { r: 128, g: 0, b: 128 },
  'Pink': { r: 255, g: 192, b: 203 },
  'White': { r: 255, g: 255, b: 255 },
  'Black': { r: 0, g: 0, b: 0 },
  'Gray': { r: 128, g: 128, b: 128 },
  'Brown': { r: 139, g: 69, b: 19 },
  'Multi-Color': { r: 128, g: 128, b: 128 }
};

export type ColorName = keyof typeof COLOR_REFERENCES;

export function mapRgbToColorName(rgb: { r: number; g: number; b: number }): ColorName {
  let minDistance = Infinity;
  let closestColor: ColorName = 'Multi-Color';

  for (const [colorName, refRgb] of Object.entries(COLOR_REFERENCES)) {
    if (colorName === 'Multi-Color') continue; // Skip multi-color in matching

    const distance = Math.sqrt(
      Math.pow(rgb.r - refRgb.r, 2) +
      Math.pow(rgb.g - refRgb.g, 2) +
      Math.pow(rgb.b - refRgb.b, 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = colorName as ColorName;
    }
  }

  return closestColor;
}

export function getColorNames(): ColorName[] {
  return Object.keys(COLOR_REFERENCES) as ColorName[];
}

/**
 * Matches an estimated RGB color to the closest available color from a product's variants
 * @param estimatedRgb The RGB color estimated from the photo
 * @param availableColors Array of color names available for this product
 * @returns The closest matching color from the available colors
 */
export function matchToAvailableColor(
  estimatedRgb: { r: number; g: number; b: number },
  availableColors: string[]
): string {
  if (availableColors.length === 0) {
    return 'Multi-Color'; // Fallback
  }

  if (availableColors.length === 1) {
    return availableColors[0]; // Only one option
  }

  let minDistance = Infinity;
  let closestColor = availableColors[0];

  for (const colorName of availableColors) {
    // Get RGB reference for this color name, or use a default
    const refRgb = COLOR_REFERENCES[colorName as ColorName] || { r: 128, g: 128, b: 128 };

    const distance = Math.sqrt(
      Math.pow(estimatedRgb.r - refRgb.r, 2) +
      Math.pow(estimatedRgb.g - refRgb.g, 2) +
      Math.pow(estimatedRgb.b - refRgb.b, 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = colorName;
    }
  }

  return closestColor;
}
