/**
 * Companies are named inconsistently across the mail one application
 * generates: "Infosys" (sender domain), "Infosys Limited" (signature),
 * "Schrödinger" (job post) vs "Schrodinger, Inc." (legal footer). Matching on
 * the raw string split one application into several. Matching goes through
 * this key instead: case/accents/punctuation folded away and trailing legal
 * suffixes dropped. Only *trailing* suffixes are dropped, so "Infosys BPM"
 * stays distinct from "Infosys".
 */

const LEGAL_SUFFIXES = new Set([
  "limited", "ltd", "pvt", "private", "inc", "incorporated", "llc", "llp",
  "corp", "corporation", "co", "company", "plc", "gmbh", "ag", "sa", "bv", "pte",
]);

export function companyKey(name: string): string {
  const folded = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

  const words = folded.split(" ").filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

export function sameCompany(a: string, b: string): boolean {
  const ka = companyKey(a);
  return ka.length > 0 && ka === companyKey(b);
}

export function roleKey(role: string): string {
  return role.toLowerCase().replace(/\s+/g, " ").trim();
}
