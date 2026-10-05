"""
Rules: turn candidate pairs into links, each carrying its own evidence.

A rule is a dict::

    {
        "signals": [
            {"name": "phash", "kind": "hash", "bits": 64, "threshold": 16},
            {"name": "clip", "kind": "embedding", "threshold": 0.8},
        ],
        "fusion": "or",          # "or", "and" or "weighted"
        "cutoff": 0.75,          # weighted only
        "direction": False,      # earlier image is the parent
        "one_parent": False,     # keep only the best parent link per image
    }

Hash thresholds are maximum bit distances. Embedding thresholds are minimum
cosine similarities. Each signal may carry a ``weight`` (default 1) used by
the weighted fusion.
"""
FUSIONS = ("or", "and", "weighted")


def signal_passes(signal, value):
    """Returns whether a raw signal value passes the signal's threshold.

    Args:
        signal: a signal spec dict
        value: the raw value (bit distance or cosine similarity)

    Returns:
        True/False
    """
    if signal["kind"] == "hash":
        return value <= signal["threshold"]

    return value >= signal["threshold"]


def normalized_score(signal, value):
    """Maps a raw signal value to a similarity score in ``[0, 1]``.

    Args:
        signal: a signal spec dict
        value: the raw value (bit distance or cosine similarity)

    Returns:
        a float in ``[0, 1]``
    """
    if signal["kind"] == "hash":
        return max(0.0, 1.0 - float(value) / signal["bits"])

    return min(1.0, max(0.0, float(value)))


def fused_score(signals, values):
    """Computes the weighted mean of the normalized signal scores.

    Args:
        signals: a list of signal spec dicts
        values: a dict mapping signal names to raw values

    Returns:
        a float in ``[0, 1]``
    """
    total = sum(s.get("weight", 1.0) for s in signals)
    if total <= 0:
        return 0.0

    return (
        sum(
            s.get("weight", 1.0) * normalized_score(s, values[s["name"]])
            for s in signals
        )
        / total
    )


def describe_rule(rule):
    """Renders a rule as a short human-readable string.

    Args:
        rule: a rule dict

    Returns:
        a string like ``"OR(phash<=16, clip>=0.80)"``
    """
    signals = rule["signals"]
    fusion = rule.get("fusion", "or")

    if fusion == "weighted":
        total = sum(s.get("weight", 1.0) for s in signals) or 1.0
        terms = " + ".join(
            "%.2f*%s" % (s.get("weight", 1.0) / total, s["name"])
            for s in signals
        )
        text = "WEIGHTED(%s >= %.2f)" % (terms, rule.get("cutoff", 0.0))
    else:
        terms = ", ".join(_describe_signal(s) for s in signals)
        text = "%s(%s)" % (fusion.upper(), terms)

    extras = []
    if rule.get("direction"):
        extras.append("earlier=parent")
    if rule.get("one_parent"):
        extras.append("one parent")

    if extras:
        text += " + " + ", ".join(extras)

    return text


def apply_rule(
    rule,
    query_ids,
    pool_ids,
    matrices,
    candidates,
    query_times=None,
    pool_times=None,
):
    """Applies a rule to candidate pairs.

    Args:
        rule: a rule dict
        query_ids: a list of query identities
        pool_ids: a list of pool identities
        matrices: a dict mapping signal names to ``num_queries x num_pool``
            arrays of raw values
        candidates: a list with one list of candidate pool indices per query
        query_times (None): an optional list of comparable timestamps per
            query, used when ``rule["direction"]`` is True
        pool_times (None): an optional list of timestamps per pool item

    Returns:
        a list with one list of link dicts per query, best link first
    """
    signals = rule["signals"]
    fusion = rule.get("fusion", "or")
    if fusion not in FUSIONS:
        raise ValueError("Unsupported fusion '%s'" % fusion)

    if not signals:
        raise ValueError("A rule needs at least one signal")

    use_direction = (
        bool(rule.get("direction"))
        and query_times is not None
        and pool_times is not None
    )
    rule_text = describe_rule(rule)

    links = []
    for qi, cand in enumerate(candidates):
        query_links = []
        for pi in cand:
            if pool_ids[pi] == query_ids[qi]:
                continue

            values = {s["name"]: _as_number(matrices[s["name"]][qi, pi]) for s in signals}
            passed = [s["name"] for s in signals if signal_passes(s, values[s["name"]])]
            fused = fused_score(signals, values)

            if fusion == "or":
                fires = bool(passed)
            elif fusion == "and":
                fires = len(passed) == len(signals)
            else:
                fires = fused >= rule.get("cutoff", 0.0)

            if not fires:
                continue

            direction = "undirected"
            if use_direction:
                direction = _direction(query_times[qi], pool_times[pi])

            query_links.append(
                {
                    "target_id": pool_ids[pi],
                    "signals": values,
                    "passed": passed,
                    "fused": round(fused, 4),
                    "rule": rule_text,
                    "direction": direction,
                }
            )

        query_links.sort(key=lambda link: link["fused"], reverse=True)

        if rule.get("one_parent") and use_direction:
            query_links = _keep_best_parent(query_links)

        links.append(query_links)

    return links


def _describe_signal(signal):
    op = "<=" if signal["kind"] == "hash" else ">="
    threshold = signal["threshold"]
    if signal["kind"] == "hash":
        return "%s%s%d" % (signal["name"], op, threshold)

    return "%s%s%.2f" % (signal["name"], op, threshold)


def _as_number(value):
    value = value.item() if hasattr(value, "item") else value
    return round(value, 4) if isinstance(value, float) else value


def _direction(query_time, target_time):
    if query_time is None or target_time is None:
        return "undirected"

    if target_time < query_time:
        return "parent"

    if target_time > query_time:
        return "child"

    return "undirected"


def _keep_best_parent(links):
    kept = []
    have_parent = False
    for link in links:
        if link["direction"] == "parent":
            if have_parent:
                continue

            have_parent = True

        kept.append(link)

    return kept
