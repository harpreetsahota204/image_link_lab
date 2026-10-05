"""
Evaluation of links against known ground-truth links.

A link between a query ``q`` and a target ``t`` is correct when ``q``'s truth
value is ``t``, or when ``t`` is itself a query whose truth value is ``q``.
The second case covers trees such as Reddit, where an image can be linked to
its child as well as its parent.
"""
from collections import defaultdict


def evaluate(query_ids, links, truth, groups=None):
    """Scores links against ground truth.

    Args:
        query_ids: a list of query identities
        links: a list with one list of link dicts per query, as returned by
            :func:`image_link_lab.core.rules.apply_rule`
        truth: a dict mapping query identities to the identity of their known
            linked image, or None for distractors with no true link
        groups (None): an optional dict mapping query identities to a group
            value or a list of group values

    Returns:
        a dict with ``overall`` metrics, ``per_group`` metrics, and
        ``misses`` (group value to the query identities whose true link was
        not found; ``"__all__"`` holds every miss)
    """
    per_group_counts = defaultdict(_empty_counts)
    overall = _empty_counts()
    misses = defaultdict(list)

    for qid, query_links in zip(query_ids, links):
        targets = [link["target_id"] for link in query_links]
        correct = sum(_is_correct(qid, t, truth) for t in targets)
        has_truth = truth.get(qid) is not None
        found = has_truth and truth[qid] in targets

        counts = {
            "links": len(targets),
            "correct": correct,
            "with_truth": int(has_truth),
            "found": int(found),
        }

        _add(overall, counts)
        query_groups = _as_list(groups.get(qid)) if groups else []
        for group in query_groups:
            _add(per_group_counts[group], counts)

        if has_truth and not found:
            misses["__all__"].append(qid)
            for group in query_groups:
                misses[group].append(qid)

    return {
        "overall": _metrics(overall),
        "per_group": {g: _metrics(c) for g, c in sorted(per_group_counts.items())},
        "misses": dict(misses),
    }


def signal_by_group_matrix(results_by_name):
    """Builds the signal-by-group recall grid.

    Args:
        results_by_name: a dict mapping a row name (a single signal, or the
            combined rule) to an :func:`evaluate` result

    Returns:
        a dict with ``rows`` (row names), ``groups`` (group values),
        ``recall`` (``rows x groups`` list of lists, None where a group has no
        queries with a true link) and ``counts`` (queries with a true link per
        group)
    """
    rows = list(results_by_name)
    groups = sorted(
        {g for result in results_by_name.values() for g in result["per_group"]}
    )

    recall = []
    for row in rows:
        per_group = results_by_name[row]["per_group"]
        recall.append(
            [
                per_group[g]["recall"]
                if g in per_group and per_group[g]["with_truth"]
                else None
                for g in groups
            ]
        )

    counts = []
    for g in groups:
        counts.append(
            max(
                (r["per_group"].get(g, {}).get("with_truth", 0) for r in results_by_name.values()),
                default=0,
            )
        )

    return {"rows": rows, "groups": groups, "recall": recall, "counts": counts}


def _is_correct(qid, target, truth):
    return truth.get(qid) == target or truth.get(target) == qid


def _empty_counts():
    return {"links": 0, "correct": 0, "with_truth": 0, "found": 0}


def _add(total, counts):
    for key, value in counts.items():
        total[key] += value


def _metrics(counts):
    precision = counts["correct"] / counts["links"] if counts["links"] else 0.0
    recall = counts["found"] / counts["with_truth"] if counts["with_truth"] else 0.0
    denom = precision + recall
    f1 = 2 * precision * recall / denom if denom else 0.0
    return {
        **counts,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


def _as_list(value):
    if value is None:
        return []

    if isinstance(value, (list, tuple, set)):
        return list(value)

    return [value]
