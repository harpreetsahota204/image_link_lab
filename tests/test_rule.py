import json
import os

import pytest

from image_link_lab.core import rule as ilr

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "rule_cases.json")

with open(FIXTURE) as f:
    CASES = json.load(f)


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda c: c["name"])
def test_rule_cases(case):
    rule = case["rule"]
    candidate = case["candidate"]
    assert ilr.passes(candidate, rule) is case["passes"]
    assert ilr.strength(candidate, rule) == case["strength"]
    assert ilr.state(candidate, rule) == case["state"]


@pytest.mark.parametrize("case", CASES["pick"], ids=lambda c: c["name"])
def test_pick_link(case):
    picked = ilr.pick_link(case["candidates"], case["rule"])
    assert (picked["original"] if picked else None) == case["picked"]


@pytest.mark.parametrize("case", CASES["keys"])
def test_rule_key(case):
    assert ilr.rule_key(case["rule"]) == case["key"]


def test_normalize_rule_requires_a_signal():
    with pytest.raises(ValueError):
        ilr.normalize_rule({"phash_max": None, "clip_min": None})

    with pytest.raises(ValueError):
        ilr.normalize_rule({"phash_max": 5, "combine": "sometimes"})

    assert ilr.normalize_rule({"phash_max": "7"}) == {
        "phash_max": 7,
        "clip_min": None,
        "combine": "any",
    }


def test_describe_rule():
    assert (
        ilr.describe_rule({"phash_max": 10, "clip_min": 0.9, "combine": "any"})
        == "pHash <= 10 bits or CLIP >= 0.90"
    )
    assert ilr.describe_rule({"phash_max": 10, "combine": "all"}) == "pHash <= 10 bits"


def test_confidence_is_mean_of_used_signals():
    rule = {"phash_max": 10, "clip_min": 0.9, "combine": "any"}
    assert ilr.confidence({"phash": 0, "clip": 1.0}, rule) == 1.0
    assert ilr.confidence({"phash": 32, "clip": 0.5}, rule) == 0.5
    assert ilr.confidence({"phash": 32, "clip": 0.5}, {"phash_max": 10}) == 0.5
