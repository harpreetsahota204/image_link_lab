import numpy as np
import pytest

from core import rules

PHASH = {"name": "phash", "kind": "hash", "bits": 64, "threshold": 16}
CLIP = {"name": "clip", "kind": "embedding", "threshold": 0.8}

QUERY_IDS = ["q0"]
POOL_IDS = ["a", "b", "c", "d"]
# a: both pass, b: only phash passes, c: only clip passes, d: neither
MATRICES = {
    "phash": np.array([[4, 10, 40, 50]]),
    "clip": np.array([[0.95, 0.5, 0.9, 0.1]]),
}
CANDIDATES = [[0, 1, 2, 3]]


def _targets(rule, **kwargs):
    links = rules.apply_rule(rule, QUERY_IDS, POOL_IDS, MATRICES, CANDIDATES, **kwargs)
    return sorted(link["target_id"] for link in links[0])


def test_or_fires_when_any_signal_passes():
    assert _targets({"signals": [PHASH, CLIP], "fusion": "or"}) == ["a", "b", "c"]


def test_and_fires_only_when_all_pass():
    assert _targets({"signals": [PHASH, CLIP], "fusion": "and"}) == ["a"]


def test_weighted_uses_cutoff():
    rule = {"signals": [PHASH, CLIP], "fusion": "weighted", "cutoff": 0.85}
    assert _targets(rule) == ["a"]


def test_weighted_respects_weights():
    heavy_clip = dict(CLIP, weight=9.0)
    rule = {"signals": [PHASH, heavy_clip], "fusion": "weighted", "cutoff": 0.8}
    assert _targets(rule) == ["a", "c"]


def test_single_signal_rule():
    assert _targets({"signals": [CLIP]}) == ["a", "c"]


def test_link_record_carries_evidence():
    links = rules.apply_rule(
        {"signals": [PHASH, CLIP], "fusion": "or"},
        QUERY_IDS,
        POOL_IDS,
        MATRICES,
        CANDIDATES,
    )
    best = links[0][0]
    assert best["target_id"] == "a"
    assert best["signals"] == {"phash": 4, "clip": 0.95}
    assert best["passed"] == ["phash", "clip"]
    assert best["rule"] == "OR(phash<=16, clip>=0.80)"
    assert best["direction"] == "undirected"
    assert 0 < best["fused"] <= 1


def test_links_are_sorted_best_first():
    links = rules.apply_rule(
        {"signals": [PHASH, CLIP], "fusion": "or"},
        QUERY_IDS,
        POOL_IDS,
        MATRICES,
        CANDIDATES,
    )
    fused = [link["fused"] for link in links[0]]
    assert fused == sorted(fused, reverse=True)


def test_self_links_are_skipped():
    links = rules.apply_rule(
        {"signals": [CLIP]},
        ["a"],
        POOL_IDS,
        {"clip": np.array([[1.0, 0.9, 0.9, 0.9]])},
        [[0, 1]],
    )
    assert [link["target_id"] for link in links[0]] == ["b"]


def test_direction_from_times():
    rule = {"signals": [PHASH, CLIP], "fusion": "or", "direction": True}
    links = rules.apply_rule(
        rule,
        QUERY_IDS,
        POOL_IDS,
        MATRICES,
        CANDIDATES,
        query_times=[10],
        pool_times=[5, 20, 10, None],
    )
    directions = {link["target_id"]: link["direction"] for link in links[0]}
    assert directions == {"a": "parent", "b": "child", "c": "undirected"}


def test_direction_ignored_without_times():
    rule = {"signals": [CLIP], "direction": True, "one_parent": True}
    assert _targets(rule) == ["a", "c"]


def test_one_parent_keeps_best_parent_only():
    rule = {
        "signals": [PHASH, CLIP],
        "fusion": "or",
        "direction": True,
        "one_parent": True,
    }
    links = rules.apply_rule(
        rule,
        QUERY_IDS,
        POOL_IDS,
        MATRICES,
        CANDIDATES,
        query_times=[100],
        pool_times=[1, 2, 3, 4],
    )
    assert [link["target_id"] for link in links[0]] == ["a"]


def test_describe_weighted_rule():
    rule = {
        "signals": [PHASH, CLIP],
        "fusion": "weighted",
        "cutoff": 0.75,
        "direction": True,
    }
    assert (
        rules.describe_rule(rule)
        == "WEIGHTED(0.50*phash + 0.50*clip >= 0.75) + earlier=parent"
    )


def test_bad_fusion_raises():
    with pytest.raises(ValueError):
        _targets({"signals": [CLIP], "fusion": "xor"})


def test_empty_signals_raises():
    with pytest.raises(ValueError):
        _targets({"signals": []})
