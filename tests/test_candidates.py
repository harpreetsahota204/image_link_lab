import numpy as np

from image_link_lab.core import candidates as ilc


def test_top_k_indices_orders_best_first():
    matrix = np.array([[5, 1, 3], [0, 9, 2]])
    assert ilc.top_k_indices(matrix, 2, higher_is_better=False).tolist() == [[1, 2], [0, 2]]
    assert ilc.top_k_indices(matrix, 2, higher_is_better=True).tolist() == [[0, 2], [1, 2]]


def test_top_k_indices_respects_exclude_and_small_pools():
    matrix = np.array([[5, 1, 3]])
    exclude = np.array([[False, True, False]])
    assert ilc.top_k_indices(matrix, 2, False, exclude=exclude).tolist() == [[2, 0]]
    assert ilc.top_k_indices(matrix, 10, False).shape == (1, 3)


def test_build_candidates_unions_signals_and_adds_truth():
    query_ids = ["q1", "q2"]
    pool_ids = ["A", "B", "C", "D"]
    pool_sids = ["sA", "sB", "sC", "sD"]
    phash = np.array([[2, 30, 40, 50], [40, 40, 3, 40]])
    clip = np.array([[0.5, 0.95, 0.4, 0.3], [0.2, 0.3, 0.4, 0.99]])
    truth = ["C", None]

    out = ilc.build_candidates(
        query_ids, pool_ids, pool_sids, phash, clip, 1, truth=truth
    )

    q1 = {c["original"]: c for c in out[0]}
    # top-1 by pHash (A), top-1 by CLIP (B), plus the truth (C)
    assert list(q1) == ["A", "B", "C"]
    assert q1["A"] == {"sample_id": "sA", "original": "A", "phash": 2, "clip": 0.5, "is_truth": False}
    assert q1["C"]["is_truth"] is True

    q2 = {c["original"]: c for c in out[1]}
    assert list(q2) == ["C", "D"]
    assert all(c["is_truth"] is False for c in q2.values())


def test_build_candidates_without_truth_has_no_is_truth():
    out = ilc.build_candidates(
        ["q"], ["A"], ["sA"], np.array([[1]]), np.array([[0.9]]), 3
    )
    assert out == [[{"sample_id": "sA", "original": "A", "phash": 1, "clip": 0.9}]]
