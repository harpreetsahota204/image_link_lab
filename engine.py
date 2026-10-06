"""
FiftyOne glue: computes the two signals, gathers candidates, applies the
rule, writes results and scores them with a native evaluation.

Both operators and the panel call these functions, so a step behaves the
same whether it starts from a form, the panel, a notebook or an agent.
"""
import logging

import numpy as np
from PIL import Image

import fiftyone as fo

from .constants import (
    CANDIDATES_PER_SIGNAL,
    CANDIDATES_SUFFIX,
    CLIP_BRAIN_KEY,
    CLIP_MODEL,
    COPY,
    GT_SUFFIX,
    MAX_GRAPH_QUERIES,
    NONE_LABEL,
    OUTPUT_FIELD,
    PHASH_BITS,
    PHASH_BRAIN_KEY,
    PHASH_FIELD,
    PRED_SUFFIX,
    SCOPE_DATASET,
    SCOPE_TAG_PREFIX,
    SCOPE_VIEW,
    SETTINGS_KEY,
    STORE_NAME,
    UNIQUE,
)
from .core import candidates as ilc
from .core import hashing as ilh
from .core import rule as ilr

logger = logging.getLogger(__name__)

_HASH_CHUNK = 256
_QUERY_CHUNK = 256
_CLIP_BATCH_SIZE = 32
_BLANK_HASH = "0" * (PHASH_BITS // 4)


def _no_progress(fraction, label):
    pass


# -- Settings --


def get_store(ctx):
    """Returns the plugin's execution store for the context's dataset."""
    return ctx.store(STORE_NAME)


def load_settings(ctx):
    """Returns the saved ``find_copies`` settings, or None."""
    return get_store(ctx).get(SETTINGS_KEY)


def save_settings(ctx, settings):
    """Saves the ``find_copies`` settings."""
    get_store(ctx).set(SETTINGS_KEY, settings)


# -- Scopes --


def scope_choices(dataset):
    """Returns the ``(value, label)`` scope choices for a dataset."""
    return [(SCOPE_VIEW, "Current view"), (SCOPE_DATASET, "Whole dataset")] + [
        (SCOPE_TAG_PREFIX + tag, "Tag: %s" % tag)
        for tag in sorted(dataset.distinct("tags"))
    ]


def resolve_scope(ctx, scope):
    """Resolves a scope string to a view.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
        scope: ``"view"``, ``"dataset"`` or ``"tag:<tag>"``

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


def field_choices(dataset):
    """Returns the top-level fields an ID or truth picker can offer."""
    skip = {
        "id",
        "filepath",
        "tags",
        "metadata",
        "created_at",
        "last_modified_at",
        PHASH_FIELD,
    }
    schema = dataset.get_field_schema(
        ftype=(fo.StringField, fo.IntField, fo.ObjectIdField)
    )
    return [name for name in schema if name not in skip]


# -- Signals --


def signal_status(dataset):
    """Returns which signals exist on a dataset."""
    return {
        "phash": dataset.has_sample_field(PHASH_FIELD),
        "clip": CLIP_BRAIN_KEY in dataset.list_brain_runs(),
    }


def compute_phash(view, progress=None):
    """Computes pHash for every image in a view, writes it to the ``phash``
    field, and registers the bits as a native similarity index under brain
    key ``phash`` so the App can sort by it.

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        progress (None): an optional ``function(fraction, label)``

    Returns:
        the number of images hashed
    """
    progress = progress or _no_progress
    dataset = view._dataset
    if not dataset.has_sample_field(PHASH_FIELD):
        dataset.add_sample_field(PHASH_FIELD, fo.StringField)

    ids, filepaths = view.values(["id", "filepath"])
    total = len(ids)
    hashed = 0
    for start in range(0, total, _HASH_CHUNK):
        values = {}
        for sid, path in zip(
            ids[start : start + _HASH_CHUNK],
            filepaths[start : start + _HASH_CHUNK],
        ):
            try:
                with Image.open(path) as img:
                    values[sid] = ilh.compute_phash(img.convert("RGB"))
            except Exception as e:
                logger.warning("Failed to hash %s: %s", path, e)

        if values:
            dataset.set_values(PHASH_FIELD, values, key_field="id")

        hashed += len(values)
        done = min(start + _HASH_CHUNK, total)
        progress(0.9 * done / max(total, 1), "Hashed %d/%d images" % (done, total))

    progress(0.95, "Indexing hashes")
    _index_phash(view)
    return hashed


def _index_phash(view):
    import fiftyone.brain as fob

    dataset = view._dataset
    if PHASH_BRAIN_KEY in dataset.list_brain_runs():
        dataset.delete_brain_run(PHASH_BRAIN_KEY)

    hashed = view.exists(PHASH_FIELD)
    if len(hashed) == 0:
        return

    bits = ilh.hex_to_bits(hashed.values(PHASH_FIELD))
    # Euclidean distance on 0/1 bits is sqrt(differing bits), so the index
    # sorts exactly like Hamming distance
    fob.compute_similarity(
        hashed,
        embeddings=bits,
        brain_key=PHASH_BRAIN_KEY,
        metric="euclidean",
        progress=False,
    )


def compute_clip(view):
    """Builds the native CLIP similarity index under brain key ``clip``.

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`

    Returns:
        the brain key
    """
    import fiftyone.brain as fob

    dataset = view._dataset
    if CLIP_BRAIN_KEY in dataset.list_brain_runs():
        dataset.delete_brain_run(CLIP_BRAIN_KEY)

    fob.compute_similarity(
        view,
        model=CLIP_MODEL,
        brain_key=CLIP_BRAIN_KEY,
        batch_size=_CLIP_BATCH_SIZE,
        progress=False,
    )
    return CLIP_BRAIN_KEY


# -- Candidates --


def candidates_field(settings):
    """Returns the field that holds each query's candidates."""
    return settings.get("output_field", OUTPUT_FIELD) + CANDIDATES_SUFFIX


def queries_view(dataset, settings):
    """Returns the samples that have candidates (the queries)."""
    field = candidates_field(settings)
    if not dataset.has_sample_field(field):
        return dataset.limit(0)

    return dataset.exists(field)


def gather_candidates(ctx, settings, progress=None):
    """Finds each query's candidate originals and stores them, with both
    signals' values, in ``<output_field>_candidates``.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
        settings: a dict with ``queries``, ``originals`` (scopes) and
            optional ``id_field``, ``truth_field``, ``output_field``
        progress (None): an optional ``function(fraction, label)``

    Returns:
        a dict with ``queries`` and ``originals`` counts
    """
    progress = progress or _no_progress
    dataset = ctx.dataset
    status = signal_status(dataset)
    missing = [k for k, ok in status.items() if not ok]
    if missing:
        raise ValueError(
            "Signals not computed: %s. Run 'Compute signals' first"
            % ", ".join(missing)
        )

    query_view = resolve_scope(ctx, settings["queries"])
    pool_view = resolve_scope(ctx, settings["originals"])
    id_field = settings.get("id_field")
    truth_field = settings.get("truth_field")

    progress(0.05, "Loading signals")
    q_sids, q_ids, q_hashes = _load_identities(query_view, id_field)
    p_sids, p_ids, p_hashes = _load_identities(pool_view, id_field)
    if not q_sids or not p_sids:
        raise ValueError("Query images and candidate originals must both be non-empty")

    truth = query_view.values(truth_field) if truth_field else None
    if truth is not None:
        truth = [str(t) if t is not None else None for t in truth]

    results = dataset.load_brain_results(CLIP_BRAIN_KEY)
    p_emb = _embeddings_for(results, p_sids)
    p_sid_arr = np.asarray(p_sids, dtype=object)

    field = candidates_field(settings)
    if dataset.has_sample_field(field):
        dataset.clear_sample_field(field)
    else:
        dataset.add_sample_field(field, fo.ListField, subfield=fo.DictField)

    total = len(q_sids)
    for start in range(0, total, _QUERY_CHUNK):
        stop = min(start + _QUERY_CHUNK, total)
        chunk_sids = q_sids[start:stop]
        q_emb = _embeddings_for(results, chunk_sids)
        phash = ilh.hamming_matrix(
            [h or _BLANK_HASH for h in q_hashes[start:stop]],
            [h or _BLANK_HASH for h in p_hashes],
        )
        clip = ilh.cosine_matrix(q_emb, p_emb)
        exclude = np.asarray(chunk_sids, dtype=object)[:, None] == p_sid_arr[None, :]
        candidates = ilc.build_candidates(
            q_ids[start:stop],
            p_ids,
            p_sids,
            phash,
            clip,
            CANDIDATES_PER_SIGNAL,
            truth=truth[start:stop] if truth is not None else None,
            exclude=exclude,
        )
        dataset.set_values(field, dict(zip(chunk_sids, candidates)), key_field="id")
        progress(0.1 + 0.85 * stop / total, "Gathered candidates for %d/%d queries" % (stop, total))

    return {"queries": total, "originals": len(p_sids)}


def _load_identities(view, id_field):
    """Returns each sample's ID, identity and hash, falling back to the
    sample ID when the identity is missing."""
    fields = ["id", PHASH_FIELD] + ([id_field] if id_field else [])
    values = view.values(fields)
    sids = [str(s) for s in values[0]]
    hashes = values[1]
    if id_field:
        ids = [str(v) if v is not None else sid for v, sid in zip(values[2], sids)]
    else:
        ids = list(sids)

    return sids, ids, hashes


def _embeddings_for(results, sample_ids):
    embeddings, found_ids, _ = results.get_embeddings(
        sample_ids=sample_ids, allow_missing=True
    )
    embeddings = np.asarray(embeddings, dtype=np.float32)
    if embeddings.ndim != 2 or not len(embeddings):
        raise ValueError("No CLIP embeddings found for the requested samples")

    out = np.zeros((len(sample_ids), embeddings.shape[1]), dtype=np.float32)
    row = {str(sid): i for i, sid in enumerate(found_ids)}
    for i, sid in enumerate(sample_ids):
        j = row.get(sid)
        if j is not None:
            out[i] = embeddings[j]

    return out


# -- Rule --


def apply_rule(ctx, settings, rule, progress=None):
    """Applies a rule to the stored candidates, writes ``<output_field>``
    and, if a truth field is set, scores it with a native binary evaluation.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
        settings: the ``find_copies`` settings
        rule: a rule dict
        progress (None): an optional ``function(fraction, label)``

    Returns:
        a summary dict
    """
    progress = progress or _no_progress
    rule = ilr.normalize_rule(rule)
    dataset = ctx.dataset
    output_field = settings.get("output_field", OUTPUT_FIELD)
    truth_field = settings.get("truth_field")

    queries = queries_view(dataset, settings)
    fields = ["id", candidates_field(settings)]
    if truth_field:
        fields.append(truth_field)

    values = queries.values(fields)
    q_sids = [str(s) for s in values[0]]
    if not q_sids:
        raise ValueError("No candidates found. Run 'Find copies' first")

    all_candidates = values[1]
    truths = values[2] if truth_field else [None] * len(q_sids)

    progress(0.2, "Applying rule")
    links, gts, preds = {}, {}, {}
    counts = {"queries": len(q_sids), "linked": 0, "right": 0, "wrong": 0, "missed": 0}
    for sid, candidates, truth in zip(q_sids, all_candidates, truths):
        candidates = candidates or []
        link = ilr.pick_link(candidates, rule)
        truth = str(truth) if truth is not None else None

        if link is None:
            links[sid] = fo.Classification(label=NONE_LABEL)
        else:
            links[sid] = fo.Classification(
                label=link["original"],
                confidence=ilr.confidence(link, rule, PHASH_BITS),
                original_id=link["sample_id"],
                phash=link["phash"],
                clip=link["clip"],
            )
            counts["linked"] += 1

        if truth_field:
            states = [ilr.state(c, rule) for c in candidates]
            counts["right"] += states.count(ilr.RIGHT)
            counts["wrong"] += states.count(ilr.WRONG)
            counts["missed"] += states.count(ilr.MISSED)

            gts[sid] = fo.Classification(label=COPY if truth else UNIQUE)
            found = link is not None and (truth is None or link["original"] == truth)
            # The best candidate's score is the confidence either way: how
            # sure we are it is a copy, or (inverted) that it is unique
            best = min(candidates, key=lambda c: ilr.rank_key(c, rule)) if candidates else None
            score = ilr.confidence(best, rule, PHASH_BITS) if best else 0.0
            preds[sid] = fo.Classification(
                label=COPY if found else UNIQUE,
                confidence=score if found else round(1.0 - score, 4),
            )

    progress(0.6, "Writing results")
    _clear_label_field(dataset, output_field)
    dataset.set_values(output_field, links, key_field="id")

    summary = dict(counts, rule=rule, rule_text=ilr.describe_rule(rule), output_field=output_field)
    if truth_field:
        progress(0.8, "Scoring")
        gt_field = output_field + GT_SUFFIX
        pred_field = output_field + PRED_SUFFIX
        _clear_label_field(dataset, gt_field)
        _clear_label_field(dataset, pred_field)
        dataset.set_values(gt_field, gts, key_field="id")
        dataset.set_values(pred_field, preds, key_field="id")

        eval_key = ilr.rule_key(rule)
        if eval_key in dataset.list_evaluations():
            dataset.delete_evaluation(eval_key)

        results = queries_view(dataset, settings).evaluate_classifications(
            pred_field,
            gt_field=gt_field,
            eval_key=eval_key,
            method="binary",
            classes=[UNIQUE, COPY],
            progress=False,
        )
        metrics = results.metrics()
        summary.update(
            eval_key=eval_key,
            precision=round(float(metrics.get("precision", 0.0)), 4),
            recall=round(float(metrics.get("recall", 0.0)), 4),
            f1=round(float(metrics.get("fscore", 0.0)), 4),
        )

    dataset.add_dynamic_sample_fields()
    progress(1.0, "Done")
    return summary


def _clear_label_field(dataset, field):
    if dataset.has_sample_field(field):
        dataset.clear_sample_field(field)
    else:
        dataset.add_sample_field(
            field, fo.EmbeddedDocumentField, embedded_doc_type=fo.Classification
        )


# -- Graph --


def graph_payload(ctx, settings, view=None, max_queries=MAX_GRAPH_QUERIES):
    """Builds the Copy Graph data for the queries in the current view.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
        settings: the ``find_copies`` settings
        view (None): the view to draw; defaults to ``ctx.view``
        max_queries (40): the most queries to include

    Returns:
        a dict with ``queries``, ``originals``, ``total`` and ``truncated``
    """
    dataset = ctx.dataset
    field = candidates_field(settings)
    if not dataset.has_sample_field(field):
        return {"queries": [], "originals": {}, "total": 0, "truncated": False}

    id_field = settings.get("id_field")
    truth_field = settings.get("truth_field")
    in_view = (view if view is not None else ctx.view).exists(field)
    total = len(in_view)
    in_view = in_view.limit(max_queries)

    values = in_view.values(
        ["id", "filepath", field, id_field or "id", truth_field or "id"]
    )

    queries = []
    original_ids = set()
    for sid, filepath, candidates, identity, truth in zip(*values):
        candidates = candidates or []
        original_ids.update(c["sample_id"] for c in candidates)
        queries.append(
            {
                "id": str(sid),
                "filepath": filepath,
                "identity": str(identity) if id_field else str(sid),
                "truth": str(truth) if truth_field and truth is not None else None,
                "candidates": candidates,
            }
        )

    originals = {}
    if original_ids:
        pool = dataset.select(list(original_ids))
        for sid, filepath, identity in zip(
            *pool.values(["id", "filepath", id_field or "id"])
        ):
            originals[str(sid)] = {
                "id": str(sid),
                "filepath": filepath,
                "identity": str(identity) if id_field else str(sid),
            }

    return {
        "queries": queries,
        "originals": originals,
        "total": total,
        "truncated": total > len(queries),
    }
