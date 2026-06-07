/**
 * Calculate Levenshtein distance between two strings
 * 
 * The Levenshtein distance is a measure of the difference between two strings,
 * calculated as the minimum number of single-character edits (insertions,
 * deletions, or substitutions) required to change one string into the other.
 * 
 * Used for tracking how much a user edited an AI-generated caption.
 * 
 * @param str1 - First string (original caption)
 * @param str2 - Second string (edited caption)
 * @returns The Levenshtein distance between the two strings
 * 
 * @example
 * calculateLevenshteinDistance("kitten", "sitting") // returns 3
 * calculateLevenshteinDistance("hello", "hello") // returns 0
 */
export function calculateLevenshteinDistance(str1: string, str2: string): number {
  // Handle edge cases
  if (str1 === str2) return 0;
  if (str1.length === 0) return str2.length;
  if (str2.length === 0) return str1.length;

  // Create a 2D array to store distances
  const matrix: number[][] = [];

  // Initialize first column (deletions from str1)
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row (insertions to str1)
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        // Characters match, no operation needed
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        // Characters don't match, find minimum cost operation
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  // Return the final distance
  return matrix[str2.length][str1.length];
}

/**
 * Calculate normalized Levenshtein distance (0-1 scale)
 * 
 * Returns a normalized score where:
 * - 0 means strings are identical
 * - 1 means strings are completely different
 * 
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Normalized distance between 0 and 1
 */
export function calculateNormalizedLevenshteinDistance(str1: string, str2: string): number {
  const distance = calculateLevenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  
  return maxLength === 0 ? 0 : distance / maxLength;
}

/**
 * Calculate similarity percentage between two strings (0-100%)
 * 
 * Returns a percentage where:
 * - 100% means strings are identical
 * - 0% means strings are completely different
 * 
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity percentage (0-100)
 */
export function calculateSimilarityPercentage(str1: string, str2: string): number {
  const normalizedDistance = calculateNormalizedLevenshteinDistance(str1, str2);
  return Math.round((1 - normalizedDistance) * 100);
}
