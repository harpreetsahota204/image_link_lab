"""
The rule: decides whether a candidate pair is a link, and what kind.

A rule is a dict::

    {
        "phash_max": 10,     # max differing bits, or None to ignore pHash
        "clip_min": 0.90,    # min cosine similarity, or None to ignore CLIP
        "combine": "any",    # "any": one signal is enough; "all": both must pass
    }

A candidate is a dict with ``phash`` (differing bits), ``clip`` (cosine
similarity) and, when a truth field is known, ``is_truth``.

``js/src/rule.ts`` mirrors this module; ``tests/fixtures/rule_cases.json``
checks that the two agree.
"""
import re

COMBINES = ("any", "all")

RIGHT = "right"
WRONG = "wrong"
MISSED = "missed"
NONE = "none"


def normalize_rule(rule):
    """Fills in defaults and validates a rule.

    Args:
        rule: a (possibly partial) rule dict

    Returns:
        a complete rule dict
    """
    rule = dict(rule or {})
    phash_max = rule.get("phash_max")
    clip_min = rule.get("clip_min")
    combine = rule.get("combine", "any")

    if phash_max is None and clip_min is None:
        raise ValueError("The rule must use at least one signal")

    if combine not in COMBINES:
        raise ValueError("combine must be one of %s" % (COMBINES,))

    return {
        "phash_max": None if phash_max is None else int(phash_max),
        "clip_min": None if clip_min is None else float(clip_min),
        "combine": combine,
    }


def signal_results(candidate, rule):
    """Returns which signals a candidate passes.

    Args:
        candidate: a candidate dict
        rule: a rule dict

    Returns:
        a dict mapping ``"phash"`` and ``"clip"`` to True/False, with only
        the signals the rule uses
    """
    results = {}
    if rule.get("phash_max") is not None:
        value = candidate.get("phash")
        results["phash"] = value is not None and value <= rule["phash_max"]

    if rule.get("clip_min") is not None:
        value = candidate.get("clip")
        results["clip"] = value is not None and value >= rule["clip_min"]

    return results


def strength(candidate, rule):
    """Returns how many of the rule's signals the candidate passes."""
    return sum(signal_results(candidate, rule).values())


def passes(candidate, rule):
    """Returns whether the rule links a candidate pair.

    Args:
        candidate: a candidate dict
        rule: a rule dict

    Returns:
        True/False
    """
    results = list(signal_results(candidate, rule).values())
    if not results:
        return False

    return any(results) if rule.get("combine", "any") == "any" else all(results)


def state(candidate, rule):
    """Classifies a candidate pair under a rule.

    Args:
        candidate: a candidate dict
        rule: a rule dict

    Returns:
        ``"right"`` (linked, and the true original), ``"wrong"`` (linked, not
        the true original), ``"missed"`` (not linked, but the true original)
        or ``"none"``. Without truth information, links are ``"right"``
        when they pass and ``"none"`` otherwise.
    """
    linked = passes(candidate, rule)
    is_truth = candidate.get("is_truth")
    if linked:
        return WRONG if is_truth is False else RIGHT

    return MISSED if is_truth else NONE


def rank_key(candidate, rule):
    """Sort key that puts the best candidate first: most signals passed,
    then highest CLIP similarity, then fewest differing bits."""
    return (
        -strength(candidate, rule),
        -(candidate.get("clip") if candidate.get("clip") is not None else -1.0),
        candidate.get("phash") if candidate.get("phash") is not None else 1e9,
    )


def pick_link(candidates, rule):
    """Picks the original a query is a copy of, under a rule.

    Args:
        candidates: a list of candidate dicts
        rule: a rule dict

    Returns:
        the best passing candidate, or None
    """
    linked = [c for c in candidates if passes(c, rule)]
    if not linked:
        return None

    return min(linked, key=lambda c: rank_key(c, rule))


def confidence(candidate, rule, phash_bits=64):
    """Maps a linked pair to a confidence in ``[0, 1]``: the mean of the
    normalized signals the rule uses."""
    scores = []
    if rule.get("phash_max") is not None and candidate.get("phash") is not None:
        scores.append(max(0.0, 1.0 - candidate["phash"] / phash_bits))

    if rule.get("clip_min") is not None and candidate.get("clip") is not None:
        scores.append(min(1.0, max(0.0, candidate["clip"])))

    return round(sum(scores) / len(scores), 4) if scores else 0.0


def describe_rule(rule):
    """Returns a one-line description, e.g. ``"pHash <= 10 bits or CLIP >= 0.90"``."""
    parts = []
    if rule.get("phash_max") is not None:
        parts.append("pHash <= %d bits" % rule["phash_max"])

    if rule.get("clip_min") is not None:
        parts.append("CLIP >= %.2f" % rule["clip_min"])

    joiner = " or " if rule.get("combine", "any") == "any" else " and "
    return joiner.join(parts)


def rule_key(rule, prefix="copies"):
    """Returns a valid evaluation key for a rule, e.g.
    ``copies_phash10_or_clip90``."""
    parts = []
    if rule.get("phash_max") is not None:
        parts.append("phash%d" % rule["phash_max"])

    if rule.get("clip_min") is not None:
        parts.append("clip%d" % round(100 * rule["clip_min"]))

    joiner = "_or_" if rule.get("combine", "any") == "any" else "_and_"
    key = prefix + "_" + joiner.join(parts)
    return re.sub(r"[^0-9a-zA-Z_]", "_", key)
