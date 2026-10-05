import { describe, expect, it } from "vitest";
import fixture from "../../../tests/fixtures/rule_cases.json";
import { describeRule, linkState, passes, pickLink, ruleKey, strength } from "../rule";
import type { Candidate, Rule } from "../types";

type Case = {
  name: string;
  rule: Rule;
  candidate: Candidate;
  passes: boolean;
  strength: number;
  state: string;
};

describe("rule matches core/rule.py on the shared fixture", () => {
  for (const c of fixture.cases as Case[]) {
    it(c.name, () => {
      expect(passes(c.candidate, c.rule)).toBe(c.passes);
      expect(strength(c.candidate, c.rule)).toBe(c.strength);
      expect(linkState(c.candidate, c.rule)).toBe(c.state);
    });
  }

  for (const p of fixture.pick as { name: string; rule: Rule; candidates: Candidate[]; picked: string | null }[]) {
    it(`pick: ${p.name}`, () => {
      expect(pickLink(p.candidates, p.rule)?.original ?? null).toBe(p.picked);
    });
  }

  for (const k of fixture.keys as { rule: Rule; key: string }[]) {
    it(`key: ${k.key}`, () => {
      expect(ruleKey(k.rule)).toBe(k.key);
    });
  }
});

describe("describeRule", () => {
  it("reads like the Python version", () => {
    expect(describeRule({ phash_max: 10, clip_min: 0.9, combine: "any" })).toBe("pHash ≤ 10 bits or CLIP ≥ 0.90");
    expect(describeRule({ phash_max: null, clip_min: 0.85, combine: "all" })).toBe("CLIP ≥ 0.85");
  });
});
