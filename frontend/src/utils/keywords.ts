export function parseKeywords(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[，,;\s]+/u)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}
