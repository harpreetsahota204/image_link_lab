"""
Computes the hash fields and embedding index that link rules use.
"""
import logging

from PIL import Image

import fiftyone.operators as foo
import fiftyone.operators.types as types

from ..constants import (
    DEFAULT_EMBEDDING_BRAIN_KEY,
    DEFAULT_EMBEDDING_MODEL,
    HASH_FIELD_PREFIX,
    SIGNALS_PROGRESS_KEY,
)
from ..core import signals as ils
from ..engine import mark_signals_changed, resolve_scope
from ..run_manager import get_store

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 256


class ComputeSignals(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_signals",
            label="Image Link Lab: compute signals",
            description=(
                "Computes perceptual hashes (pHash, dHash, PDQ) as sample "
                "fields and an embedding similarity index, so Image Link Lab "
                "rules can combine them. The first run downloads the chosen "
                "zoo model"
            ),
            icon="fingerprint",
            execute_as_generator=True,
            allow_immediate_execution=True,
            allow_delegated_execution=True,
            default_choice_to_delegated=True,
            risk_level=types.RiskLevel.MEDIUM,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.view_target(ctx)

        inputs.md(
            "Hashes are stored as `sig_<hash>` fields. Each embedding model "
            "gets its own similarity index",
            name="intro",
        )
        for name in ils.HASH_SIGNALS:
            inputs.bool(
                name,
                default=name != "dhash",
                label="Compute %s" % name,
                view=types.CheckboxView(),
            )

        inputs.bool(
            "embeddings",
            default=True,
            label="Compute embeddings",
            view=types.CheckboxView(),
        )
        inputs.str(
            "model",
            default=DEFAULT_EMBEDDING_MODEL,
            label="Embedding model",
            description="Any FiftyOne zoo model that produces embeddings",
        )
        inputs.str(
            "brain_key",
            default=DEFAULT_EMBEDDING_BRAIN_KEY,
            label="Index name",
            description="The brain key for the similarity index",
        )
        inputs.int(
            "batch_size", default=16, label="Embedding batch size", min=1
        )
        inputs.bool(
            "skip_existing",
            default=True,
            label="Skip samples that already have hashes",
        )
        inputs.bool(
            "overwrite_index",
            default=False,
            label="Rebuild the index if it already exists",
        )

        return types.Property(inputs, view=types.View(label="Compute signals"))

    def resolve_delegation(self, ctx):
        # The panel passes an explicit choice; the operator browser doesn't
        return ctx.params.get("delegate", None)

    def execute(self, ctx):
        scope = ctx.params.get("scope")
        view = resolve_scope(ctx, scope) if scope else ctx.target_view()
        hashes = [h for h in ils.HASH_SIGNALS if ctx.params.get(h, False)]
        summary = {"hashed": 0, "skipped": 0, "failed": 0, "brain_key": None}

        try:
            if hashes:
                yield from _compute_hashes(ctx, view, hashes, summary)

            if ctx.params.get("embeddings", False):
                yield from _progress(ctx, 0.6, "Computing embeddings")
                summary["brain_key"] = _compute_index(ctx, view)
        except Exception as e:
            _report(ctx, "failed", label=str(e))
            raise

        mark_signals_changed(ctx)
        yield from _progress(ctx, 1.0, "Done", state="done")
        yield summary

    def resolve_output(self, ctx):
        if ctx.params.get("from_panel"):
            return None

        outputs = types.Object()
        outputs.int("hashed", label="Samples hashed")
        outputs.int("skipped", label="Samples skipped")
        outputs.int("failed", label="Images that failed to load")
        outputs.str("brain_key", label="Similarity index")
        return types.Property(outputs)


def _compute_hashes(ctx, view, hashes, summary):
    fields = [HASH_FIELD_PREFIX + h for h in hashes]
    todo = view
    if ctx.params.get("skip_existing", True):
        missing = [view.exists(f, False).values("id") for f in fields]
        todo_ids = set().union(*missing)
        summary["skipped"] = len(view) - len(todo_ids)
        todo = view.select(list(todo_ids))

    ids, filepaths = todo.values(["id", "filepath"])
    total = max(1, len(ids))
    share = 0.6 if ctx.params.get("embeddings", False) else 1.0
    for start in range(0, len(ids), _CHUNK_SIZE):
        values = {f: {} for f in fields}
        for sid, path in zip(
            ids[start : start + _CHUNK_SIZE],
            filepaths[start : start + _CHUNK_SIZE],
        ):
            try:
                with Image.open(path) as img:
                    img = img.convert("RGB")
                    for h, f in zip(hashes, fields):
                        values[f][sid] = ils.compute_hash(h, img)
            except Exception as e:
                logger.warning("Failed to hash %s: %s", path, e)
                summary["failed"] += 1

        for f, by_id in values.items():
            if by_id:
                ctx.dataset.set_values(f, by_id, key_field="id")

        done = min(start + _CHUNK_SIZE, len(ids))
        summary["hashed"] = done - summary["failed"]
        yield from _progress(
            ctx, share * done / total, "Hashed %d/%d images" % (done, len(ids))
        )


def _compute_index(ctx, view):
    import fiftyone.brain as fob

    brain_key = ctx.params.get("brain_key") or DEFAULT_EMBEDDING_BRAIN_KEY
    dataset = ctx.dataset
    if brain_key in dataset.list_brain_runs():
        if not ctx.params.get("overwrite_index", False):
            return brain_key

        dataset.delete_brain_run(brain_key)

    fob.compute_similarity(
        view,
        model=ctx.params.get("model") or DEFAULT_EMBEDDING_MODEL,
        brain_key=brain_key,
        batch_size=ctx.params.get("batch_size", 16),
        progress=False,
    )
    return brain_key


def _progress(ctx, fraction, label, state="running"):
    """Reports progress to the panel through the store, and yields the App
    progress update to send, if any. Delegated runs report it directly, and
    panel runs show it in the panel instead of an App dialog."""
    _report(ctx, state, fraction, label)
    if ctx.delegated:
        ctx.set_progress(progress=fraction, label=label)
        return

    if ctx.params.get("from_panel"):
        return

    yield ctx.trigger("set_progress", {"progress": fraction, "label": label})


def _report(ctx, state, fraction=None, label=None):
    get_store(ctx).set(
        SIGNALS_PROGRESS_KEY,
        {"state": state, "progress": fraction, "label": label},
    )
