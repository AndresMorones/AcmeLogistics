// Tiered scoring (exact > prefix > word-prefix > acronym > substring > subsequence) gives intuitive ordering without a full edit-distance pass; O(n) per row stays cheap at the few-hundred-item ceiling this palette feeds.
export function fuzzyScore(haystack: string, needle: string): number {
  // LOAD-BEARING: empty needle returns 1 (not 0) so the caller's `>0` filter passes every row on default-open; flipping to 0 hides everything until the user types.
  if (!needle) return 1;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h === n) return 1000;
  if (h.startsWith(n)) return 600;
  const words = h.split(/[\s_\-./]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(n))) return 400;
  const acronym = words.map((w) => w[0] ?? "").join("");
  if (acronym.startsWith(n)) return 300;
  if (h.includes(n)) return 200;
  let i = 0;
  for (let k = 0; k < h.length && i < n.length; k++) if (h[k] === n[i]) i++;
  return i === n.length ? 50 : 0;
}
