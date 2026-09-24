export function isRemoteText(s: string): boolean {
  return /\bremote\b|\banywhere\b|work from home|\bwfh\b/i.test(s);
}

export function uniq(xs: string[]): string[] {
  return [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
}
