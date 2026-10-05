"""
Candidate generation: the top-k nearest pool images per query, per signal.
"""
import numpy as np


def top_k(scores, k, higher_is_better, exclude=None):
    """Returns the indices of the best ``k`` pool items for each query.

    Args:
        scores: a ``num_queries x num_pool`` array
        k: the number of candidates per query
        higher_is_better: whether larger scores are better
        exclude (None): an optional boolean mask of the same shape as
            ``scores`` marking pairs that can never be candidates, such as an
            image paired with itself

    Returns:
        a ``num_queries x min(k, num_pool)`` int array, best first
    """
    scores = np.asarray(scores, dtype=np.float64)
    num_pool = scores.shape[1]
    k = min(k, num_pool)
    if k <= 0:
        return np.zeros((scores.shape[0], 0), dtype=np.int64)

    keyed = -scores if higher_is_better else scores.copy()
    if exclude is not None:
        keyed[exclude] = np.inf

    part = np.argpartition(keyed, k - 1, axis=1)[:, :k]
    order = np.take_along_axis(keyed, part, axis=1).argsort(axis=1)
    best = np.take_along_axis(part, order, axis=1)

    if exclude is not None:
        valid = ~np.take_along_axis(exclude, best, axis=1)
        best = np.where(valid, best, -1)

    return best


def union_candidates(per_signal_indices):
    """Unions the per-signal candidate indices for each query.

    Args:
        per_signal_indices: a dict mapping signal names to the arrays
            returned by :func:`top_k`

    Returns:
        a list with one sorted list of pool indices per query
    """
    arrays = list(per_signal_indices.values())
    if not arrays:
        return []

    num_queries = arrays[0].shape[0]
    candidates = []
    for i in range(num_queries):
        idx = set()
        for arr in arrays:
            idx.update(int(j) for j in arr[i] if j >= 0)

        candidates.append(sorted(idx))

    return candidates
