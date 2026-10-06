/**
 * The rule, applied in the browser so the sliders update the graph with no
 * server round-trip. Mirrors core/rule.py; tests/fixtures/rule_cases.json
 * keeps the two in step.
 */
import type { Candidate, LinkState, Rule } from "./types";

export function signalResults(
  candidate: Pick<Candidate, "phash" | "clip">,
  rule: Rule,
): { phash?: boolean; clip?: boolean } {
  const results: { phash?: boolean; clip?: boolean } = {};
  if (rule.phash_max !== null && rule.phash_max !== undefined) {
    results.phash = candidate.phash !== null && candidate.phash !== undefined
      && candidate.phash <= rule.phash_max;
  }
  if (rule.clip_min !== null && rule.clip_min !== undefined) {
    results.clip = candidate.clip !== null && candidate.clip !== undefined
      && candidate.clip >= rule.clip_min;
  }
  return results;
}

export function strength(candidate: Pick<Candidate, "phash" | "clip">, rule: Rule): number {
  return Object.values(signalResults(candidate, rule)).filter(Boolean).length;
}

export function passes(candidate: Pick<Candidate, "phash" | "clip">, rule: Rule): boolean {
  const results = Object.values(signalResults(candidate, rule));
  if (!results.length) return false;
  return rule.combine === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function linkState(candidate: Candidate, rule: Rule): LinkState {
  const linked = passes(candidate, rule);
  if (linked) return candidate.is_truth === false ? "wrong" : "right";
  return candidate.is_truth ? "missed" : "none";
}

/** Sort key: most signals passed, then highest CLIP, then fewest bits. */
export function compareCandidates(a: Candidate, b: Candidate, rule: Rule): number {
  const ds = strength(b, rule) - strength(a, rule);
  if (ds) return ds;
  const dc = (b.clip ?? -1) - (a.clip ?? -1);
  if (dc) return dc;
  return (a.phash ?? 1e9) - (b.phash ?? 1e9);
}

export function pickLink(candidates: Candidate[], rule: Rule): Candidate | null {
  const linked = candidates.filter((c) => passes(c, rule));
  if (!linked.length) return null;
  return [...linked].sort((a, b) => compareCandidates(a, b, rule))[0];
}

export function describeRule(rule: Rule): string {
  const parts: string[] = [];
  if (rule.phash_max !== null) parts.push(`pHash ≤ ${rule.phash_max} bits`);
  if (rule.clip_min !== null) parts.push(`CLIP ≥ ${rule.clip_min.toFixed(2)}`);
  return parts.join(rule.combine === "all" ? " and " : " or ");
}

export function ruleKey(rule: Rule): string {
  const parts: string[] = [];
  if (rule.phash_max !== null) parts.push(`phash${rule.phash_max}`);
  if (rule.clip_min !== null) parts.push(`clip${Math.round(100 * rule.clip_min)}`);
  return `copies_${parts.join(rule.combine === "all" ? "_and_" : "_or_")}`;
}

export function usesPhash(rule: Rule): boolean {
  return rule.phash_max !== null;
}

export function usesClip(rule: Rule): boolean {
  return rule.clip_min !== null;
}
