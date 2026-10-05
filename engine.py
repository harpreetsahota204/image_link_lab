"""
FiftyOne glue: resolves views and signals, runs the core rule logic, writes
links to samples and records the run.

Both the ``run_rule`` operator and the panel call :func:`run_link_rule`, so a
run behaves the same whether it starts from the panel, the operator browser,
the MCP server or a script.
"""
import hashlib
import logging
from collections import OrderedDict

import numpy as np

from .constants import (
    DEFAULT_EMBEDDING_THRESHOLD,
    DEFAULT_HASH_THRESHOLDS,
    DEFAULT_TOP_K,
    HASH_FIELD_PREFIX,
    LINKS_FIELD_PREFIX,
    MAX_PAIRS,
    SCOPE_DATASET,
    SCOPE_TAG_PREFIX,
    SCOPE_VIEW,
    SIGNALS_STATUS_KEY,
    RunStatus,
)
from .core import candidates as ilc
from .core import evaluate as ile
from .core import rules as ilr
from .core import signals as ils
from .run_manager import RunManager, get_store, now_iso

logger = logging.getLogger(__name__)

_MATRIX_CACHE = OrderedDict()
_MATRIX_CACHE_SIZE = 4


def list_available_signals(dataset):
    """Lists the signals a rule can use on a dataset.

    Hash signals are ``sig_phash``, ``sig_dhash`` and ``sig_pdq`` fields.
    Embedding signals are any similarity brain run, so indexes built outside
    this plugin can be used too.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`

    Returns:
        a list of signal dicts with ``name``, ``kind`` and ``source`` keys
    """
    schema = dataset.get_field_schema()
    available = []
    for name, bits in ils.HASH_BITS.items():
        field = HASH_FIELD_PREFIX + name
        if field in schema:
            available.append(
                {"name": name, "kind": "hash", "source": field, "bits": bits}
            )

    for key in dataset.list_brain_runs(type="similarity"):
        try:
            config = dataset.get_brain_info(key).config
            model = getattr(config, "model", None)
        except Exception as e:
            logger.warning("Failed to load brain info for %s: %s", key, e)
            model = None

        available.append(
            {"name": key, "kind": "embedding", "source": key, "model": model}
        )

    return available


def default_threshold(signal):
    """Returns the starting threshold for a signal.

    Args:
        signal: a signal dict with ``name`` and ``kind`` keys

    Returns:
        a max bit distance for hashes, or a min cosine similarity
    """
    if signal["kind"] == "hash":
        return DEFAULT_HASH_THRESHOLDS.get(signal["name"], 16)

    return DEFAULT_EMBEDDING_THRESHOLD


def resolve_scope(ctx, scope):
    """Resolves a scope string to a view.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
        scope: ``"view"`` (the App's current view), ``"dataset"``, or
            ``"tag:<tag>"``

    Returns:
        a :class:`fiftyone.core.collections.SampleCollection`
    """
    if scope == SCOPE_VIEW:
        return ctx.view

    if scope == SCOPE_DATASET:
        return ctx.dataset

    if scope and scope.startswith(SCOPE_TAG_PREFIX):
        return ctx.dataset.match_tags(scope[len(SCOPE_TAG_PREFIX) :])

    raise ValueError("Unsupported scope '%s'" % scope)


def links_field_for(run_id):
    """Returns the sample field that holds a run's links.

    Args:
        run_id: the run ID

    Returns:
        a field name
    """
    return LINKS_FIELD_PREFIX + run_id.replace("-", "")[:8]


def run_link_rule(ctx, params, progress=None):
    """Runs a link rule and records it as a run.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
        params: a dict with ``rule``, ``scope`` (``{"query", "pool"}``),
            optional ``fields`` (``{"id", "truth", "group", "time"}``),
            ``top_k`` and ``run_name``
        progress (None): an optional ``function(fraction, label)``

    Returns:
        the completed run dict
    """
    progress = progress or (lambda *args: None)
    manager = RunManager(ctx)
    params = dict(params)
    params["rule"] = dict(
        params["rule"],
        signals=_resolve_signals(ctx.dataset, params["rule"]["signals"]),
    )
    params["rule_text"] = ilr.describe_rule(params["rule"])
    run = manager.create_run(params)

    run_id = run["run_id"]
    run["status"] = RunStatus.RUNNING.value
    run["start_time"] = now_iso()
    manager.set_run(run_id, run)

    try:
        _execute(ctx, run, progress)
        run["status"] = RunStatus.COMPLETED.value
    except Exception as e:
        logger.error("Link run %s failed: %s", run_id, e, exc_info=True)
        run["status"] = RunStatus.FAILED.value
        run["status_details"] = str(e)
        raise
    finally:
        run["end_time"] = now_iso()
        manager.set_run(run_id, run)

    return run


def delete_run_links(ctx, run):
    """Deletes the sample field holding a run's links, if it exists.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
        run: a run dict
    """
    field = run.get("links_field")
    if field and ctx.dataset.has_sample_field(field):
        ctx.dataset.delete_sample_field(field)


def misses_view(ctx, run, row, group):
    """Returns the view of queries whose true link a grid cell missed.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
        run: a run dict, including its heavy fields
        row: a signal name, or ``"rule"`` for the combined rule
        group: a group value

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    sample_ids = ((run.get("misses") or {}).get(row) or {}).get(group) or []
    return ctx.dataset.select(sample_ids, ordered=True)


def links_view(ctx, run, sample_id):
    """Returns a view of a sample followed by the images it links to.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
        run: a run dict
        sample_id: the query sample ID

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    links = get_sample_links(ctx, run, sample_id)
    ids = [sample_id] + [
        link["sample_id"] for link in links if link.get("sample_id")
    ]
    return ctx.dataset.select(ids, ordered=True)


def get_sample_links(ctx, run, sample_id):
    """Returns the links a run made for one sample.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
        run: a run dict
        sample_id: the sample ID

    Returns:
        a list of link dicts (empty if the sample was not a query)
    """
    field = run.get("links_field")
    if not field or not ctx.dataset.has_sample_field(field):
        return []

    values = ctx.dataset.select(sample_id).values(field)
    return (values[0] if values else None) or []


def pair_signals(ctx, signals, sample_id, target_sample_id):
    """Computes every signal's raw value for one pair of samples, with
    whether it passes its threshold. Used to explain a missed link.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
        signals: a list of resolved signal dicts, as stored on a run's rule
        sample_id: the first sample ID
        target_sample_id: the second sample ID

    Returns:
        a dict with ``signals`` (name to raw value) and ``passed`` (names)
    """
    pair = ctx.dataset.select([sample_id, target_sample_id], ordered=True)
    values = {}
    for s in signals:
        if s["kind"] == "hash":
            a, b = pair.values(s["source"])
            if a is None or b is None:
                values[s["name"]] = s["bits"]
            else:
                values[s["name"]] = int(ils.hamming_matrix([a], [b])[0, 0])
        else:
            results = ctx.dataset.load_brain_results(s["source"])
            emb = _embeddings_for(results, [sample_id, target_sample_id])
            values[s["name"]] = round(
                float(ils.cosine_matrix(emb[:1], emb[1:])[0, 0]), 4
            )

    passed = [s["name"] for s in signals if ilr.signal_passes(s, values[s["name"]])]
    return {"signals": values, "passed": passed}


def mark_signals_changed(ctx):
    """Records that signals changed, which notifies panel subscribers and
    invalidates cached matrices.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
    """
    get_store(ctx).set(SIGNALS_STATUS_KEY, {"updated_at": now_iso()})
    _MATRIX_CACHE.clear()


def _execute(ctx, run, progress):
    rule = run["rule"]
    scope = run["scope"]
    fields = run.get("fields") or {}
    top_k = int(run.get("top_k") or DEFAULT_TOP_K)

    query_view = resolve_scope(ctx, scope.get("query", SCOPE_VIEW))
    pool_view = resolve_scope(ctx, scope.get("pool", SCOPE_DATASET))

    q_sids = [str(i) for i in query_view.values("id")]
    p_sids = [str(i) for i in pool_view.values("id")]
    if not q_sids or not p_sids:
        raise ValueError("The query scope and the pool must both be non-empty")

    if len(q_sids) * len(p_sids) > MAX_PAIRS:
        raise ValueError(
            "%d queries x %d pool images is too many pairs (max %d). Narrow "
            "the query scope or the pool"
            % (len(q_sids), len(p_sids), MAX_PAIRS)
        )

    signals = rule["signals"]

    progress(0.1, "Loading signals")
    matrices = _get_matrices(ctx, query_view, pool_view, q_sids, p_sids, signals)

    progress(0.5, "Generating candidates")
    exclude = np.asarray(q_sids, dtype=object)[:, None] == np.asarray(
        p_sids, dtype=object
    )[None, :]
    per_signal = {
        s["name"]: ilc.top_k(
            matrices[s["name"]],
            top_k,
            higher_is_better=s["kind"] == "embedding",
            exclude=exclude,
        )
        for s in signals
    }

    id_field = fields.get("id")
    q_ids = _identities(query_view, id_field, q_sids)
    p_ids = _identities(pool_view, id_field, p_sids)
    q_times = p_times = None
    if fields.get("time"):
        q_times = query_view.values(fields["time"])
        p_times = pool_view.values(fields["time"])

    progress(0.6, "Applying rule")
    links = ilr.apply_rule(
        rule,
        q_ids,
        p_ids,
        matrices,
        ilc.union_candidates(per_signal),
        query_times=q_times,
        pool_times=p_times,
    )

    p_sid_by_id = dict(zip(p_ids, p_sids))
    for query_links in links:
        for link in query_links:
            link["sample_id"] = p_sid_by_id.get(link["target_id"])

    progress(0.75, "Writing links")
    links_field = links_field_for(run["run_id"])
    ctx.dataset.set_values(links_field, dict(zip(q_sids, links)), key_field="id")
    run["links_field"] = links_field
    run["num_queries"] = len(q_sids)
    run["num_pool"] = len(p_sids)
    run["metrics"] = {
        "links": sum(len(ql) for ql in links),
        "queries_with_links": sum(1 for ql in links if ql),
    }

    if not fields.get("truth"):
        return

    progress(0.85, "Scoring")
    truth = dict(zip(q_ids, query_view.values(fields["truth"])))
    if fields.get("group"):
        groups = dict(zip(q_ids, query_view.values(fields["group"])))
    else:
        groups = dict.fromkeys(q_ids, "all")

    q_sid_by_id = dict(zip(q_ids, q_sids))
    combined = ile.evaluate(q_ids, links, truth, groups=groups)

    rows = OrderedDict()
    for s in signals:
        single = ilr.apply_rule(
            {"signals": [s], "fusion": "or"},
            q_ids,
            p_ids,
            matrices,
            ilc.union_candidates({s["name"]: per_signal[s["name"]]}),
        )
        rows[s["name"]] = ile.evaluate(q_ids, single, truth, groups=groups)

    rows["rule"] = combined

    run["metrics"].update(combined["overall"])
    run["group_matrix"] = ile.signal_by_group_matrix(rows)
    run["misses"] = {
        name: {
            group: [q_sid_by_id[q] for q in qids]
            for group, qids in result["misses"].items()
        }
        for name, result in rows.items()
    }


def _resolve_signals(dataset, requested):
    available = {s["name"]: s for s in list_available_signals(dataset)}
    resolved = []
    for spec in requested:
        name = spec["name"]
        if name not in available:
            raise ValueError(
                "Signal '%s' has not been computed on this dataset. Run "
                "compute_signals first" % name
            )

        merged = dict(available[name])
        merged["threshold"] = float(spec["threshold"])
        merged["weight"] = float(spec.get("weight", 1.0))
        resolved.append(merged)

    if not resolved:
        raise ValueError("Enable at least one signal")

    return resolved


def _identities(view, id_field, sample_ids):
    if not id_field:
        return list(sample_ids)

    values = view.values(id_field)
    return [v if v is not None else sid for v, sid in zip(values, sample_ids)]


def _get_matrices(ctx, query_view, pool_view, q_sids, p_sids, signals):
    status = get_store(ctx).get(SIGNALS_STATUS_KEY) or {}
    digest = hashlib.sha1(
        ("|".join(q_sids) + "#" + "|".join(p_sids)).encode()
    ).hexdigest()

    matrices = {}
    for s in signals:
        key = (
            str(ctx.dataset._doc.id),
            s["kind"],
            s["source"],
            status.get("updated_at"),
            digest,
        )
        if key in _MATRIX_CACHE:
            _MATRIX_CACHE.move_to_end(key)
            matrices[s["name"]] = _MATRIX_CACHE[key]
            continue

        if s["kind"] == "hash":
            matrix = _hash_matrix(query_view, pool_view, s)
        else:
            matrix = _embedding_matrix(ctx.dataset, q_sids, p_sids, s)

        _MATRIX_CACHE[key] = matrix
        while len(_MATRIX_CACHE) > _MATRIX_CACHE_SIZE * max(1, len(signals)):
            _MATRIX_CACHE.popitem(last=False)

        matrices[s["name"]] = matrix

    return matrices


def _hash_matrix(query_view, pool_view, signal):
    q_hashes = query_view.values(signal["source"])
    p_hashes = pool_view.values(signal["source"])
    blank = "0" * (signal["bits"] // 4)
    matrix = ils.hamming_matrix(
        [h or blank for h in q_hashes], [h or blank for h in p_hashes]
    )

    # Images without a hash can never pass a hash threshold
    matrix[[h is None for h in q_hashes], :] = signal["bits"]
    matrix[:, [h is None for h in p_hashes]] = signal["bits"]
    return matrix


def _embedding_matrix(dataset, q_sids, p_sids, signal):
    results = dataset.load_brain_results(signal["source"])
    q_emb = _embeddings_for(results, q_sids)
    p_emb = _embeddings_for(results, p_sids)
    return ils.cosine_matrix(q_emb, p_emb)


def _embeddings_for(results, sample_ids):
    embeddings, found_ids, _ = results.get_embeddings(
        sample_ids=sample_ids, allow_missing=True
    )
    embeddings = np.asarray(embeddings, dtype=np.float32)
    if embeddings.ndim != 2 or not len(embeddings):
        raise ValueError("No embeddings found for the requested samples")

    out = np.zeros((len(sample_ids), embeddings.shape[1]), dtype=np.float32)
    row = {str(sid): i for i, sid in enumerate(found_ids)}
    for i, sid in enumerate(sample_ids):
        j = row.get(sid)
        if j is not None:
            out[i] = embeddings[j]

    return out
