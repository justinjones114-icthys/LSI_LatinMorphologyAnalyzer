const COMBINING_MARKS = /[\u0300-\u036f]/g;
const LATIN_LETTERS = /[^a-z]/g;

export function normalizeLatin(value: string): string {
  return value
    .replaceAll("æ", "ae")
    .replaceAll("Æ", "Ae")
    .replaceAll("œ", "oe")
    .replaceAll("Œ", "Oe")
    .replaceAll("j", "i")
    .replaceAll("J", "I")
    .replaceAll("v", "u")
    .replaceAll("V", "U")
    .replaceAll("ụ", "u")
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(LATIN_LETTERS, "");
}

export function prefixShard(value: string): string {
  if (!value) return "empty";
  const first = value[0] && /[a-z]/i.test(value[0]) ? value[0] : "_";
  const second = value[1] && /[a-z]/i.test(value[1]) ? value[1] : "_";
  return `${first}${second}`;
}

export function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function lemmaShard(lemmaId: string, count: number): number {
  return fnv1a(lemmaId) % count;
}
