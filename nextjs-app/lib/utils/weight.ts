// Weight/variant-value helpers shared by the companion and embedded UIs.

export const MIN_WEIGHT_G = 100;
export const MAX_WEIGHT_G = 300;
export const WEIGHT_OPTIONS = Array.from(
  { length: MAX_WEIGHT_G - MIN_WEIGHT_G + 1 },
  (_, i) => MIN_WEIGHT_G + i
);

// Existing variant values look like "179g pink rim orange silver foil":
// a leading weight, then a free-text rim/foil description. (The description
// is separate from the estimated disc color.)
export function splitWeightValue(value: string): { grams: number | null; description: string } {
  const match = value.trim().match(/^(\d{2,3})\s*g\b\s*(.*)$/i);
  if (!match) {
    return { grams: null, description: value.trim() };
  }
  return { grams: parseInt(match[1], 10), description: match[2].trim() };
}

// Unique rim/foil descriptions for autocomplete, weight + dedup suffix stripped
export function descriptionsFromWeights(weights: string[]): string[] {
  const descriptions = new Set<string>();
  for (const value of weights) {
    const { description } = splitWeightValue(value);
    const cleaned = description.replace(/\s+\d+$/, '').trim();
    if (cleaned) {
      descriptions.add(cleaned);
    }
  }
  return Array.from(descriptions).sort();
}

export function combineWeight(grams: string | number, description: string): string {
  const trimmed = description.trim();
  return trimmed ? `${grams}g ${trimmed}` : `${grams}g`;
}
