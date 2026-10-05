import numpy as np

from core import candidates


def test_top_k_higher_is_better():
    scores = np.array([[0.1, 0.9, 0.5], [0.7, 0.2, 0.8]])
    best = candidates.top_k(scores, 2, higher_is_better=True)
    assert best.tolist() == [[1, 2], [2, 0]]


def test_top_k_lower_is_better():
    dists = np.array([[10, 2, 7]])
    best = candidates.top_k(dists, 2, higher_is_better=False)
    assert best.tolist() == [[1, 2]]


def test_top_k_caps_at_pool_size():
    best = candidates.top_k(np.array([[1.0, 2.0]]), 10, higher_is_better=True)
    assert best.shape == (1, 2)


def test_top_k_excludes_masked_pairs():
    scores = np.array([[1.0, 0.5, 0.2]])
    exclude = np.array([[True, False, False]])
    best = candidates.top_k(scores, 3, higher_is_better=True, exclude=exclude)
    assert best.tolist() == [[1, 2, -1]]


def test_union_candidates_merges_signals():
    per_signal = {
        "phash": np.array([[0, 1], [2, -1]]),
        "clip": np.array([[1, 3], [2, 0]]),
    }
    assert candidates.union_candidates(per_signal) == [[0, 1, 3], [0, 2]]


def test_union_candidates_empty():
    assert candidates.union_candidates({}) == []
