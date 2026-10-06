"""
Candidate gathering: for each query, the few originals worth considering.

Pure numpy; the FiftyOne glue in ``engine.py`` supplies the matrices.
"""
import numpy as np


def top_k_indices(matrix, k, higher_is_better, exclude=None):
    """Returns the ``k`` best pool columns for each query row.

    Args:
        matrix: a ``num_queries x num_pool`` array
        k: how many columns to keep per row
        higher_is_better: whether large values are better
        exclude (None): an optional boolean mask of pairs to skip

    Returns:
        a ``num_queries x k`` int array of column indices
    """
    scores = np.asarray(matrix, dtype=np.float32)
    if not higher_is_better:
        scores = -scores

    if exclude is not None:
        scores = np.where(exclude, -np.inf, scores)

    k = min(k, scores.shape[1])
    if k <= 0:
        return np.zeros((scores.shape[0], 0), dtype=int)

    part = np.argpartition(-scores, k - 1, axis=1)[:, :k]
    order = np.argsort(-np.take_along_axis(scores, part, axis=1), axis=1)
    return np.take_along_axis(part, order, axis=1)


def build_candidates(
    query_ids,
    pool_ids,
    pool_sample_ids,
    phash,
    clip,
    k,
    truth=None,
    exclude=None,
):
    """Builds each query's candidate list: the ``k`` nearest originals by
    pHash, the ``k`` nearest by CLIP, and the true original if known.

    Args:
        query_ids: a list of query identities
        pool_ids: a list of pool identities
        pool_sample_ids: the pool's sample IDs, aligned with ``pool_ids``
        phash: a ``num_queries x num_pool`` array of differing bits
        clip: a ``num_queries x num_pool`` array of cosine similarities
        k: candidates to keep per signal
        truth (None): an optional list, aligned with ``query_ids``, of the
            true original's identity (or None) for each query
        exclude (None): an optional boolean mask of pairs to skip

    Returns:
        a list with one list of candidate dicts per query
    """
    by_phash = top_k_indices(phash, k, higher_is_better=False, exclude=exclude)
    by_clip = top_k_indices(clip, k, higher_is_better=True, exclude=exclude)
    pool_index = {pid: j for j, pid in enumerate(pool_ids)}

    out = []
    for i in range(len(query_ids)):
        # Union of both signals' picks, pHash first, without duplicates
        cols = list(dict.fromkeys(int(j) for j in (*by_phash[i], *by_clip[i])))

        truth_id = truth[i] if truth is not None else None
        truth_col = pool_index.get(truth_id) if truth_id is not None else None
        if truth_col is not None and truth_col not in cols:
            cols.append(truth_col)

        candidates = []
        for j in cols:
            record = {
                "sample_id": pool_sample_ids[j],
                "original": pool_ids[j],
                "phash": int(phash[i, j]),
                "clip": round(float(clip[i, j]), 4),
            }
            if truth is not None:
                record["is_truth"] = truth_id is not None and j == truth_col

            candidates.append(record)

        out.append(candidates)

    return out
