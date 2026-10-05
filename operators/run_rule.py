"""
Applies a link rule from the operator browser, the MCP server or a script.
The panel calls the same :func:`image_link_lab.engine.run_link_rule`.
"""
import fiftyone.operators as foo
import fiftyone.operators.types as types

from ..constants import (
    DEFAULT_TOP_K,
    HASH_FIELD_PREFIX,
    LINKS_FIELD_PREFIX,
    SCOPE_DATASET,
    SCOPE_TAG_PREFIX,
    SCOPE_VIEW,
)
from ..core.rules import FUSIONS
from ..engine import default_threshold, list_available_signals, run_link_rule

_FIELD_ROLES = (
    ("id", "ID field", "Field holding each image's identity"),
    ("truth", "Truth field", "Field holding the identity of the known linked image. Enables scoring"),
    ("group", "Group field", "Field (string or list) to break scores down by"),
    ("time", "Time field", "Datetime field. The earlier image is treated as the parent"),
)


class RunRule(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="run_rule",
            label="Image Link Lab: run rule",
            description=(
                "Links each query image to pool images using a rule that "
                "combines hash and embedding signals, writes the links to a "
                "links_<run> field, and scores them against a truth field"
            ),
            icon="hub",
            dynamic=True,
            allow_immediate_execution=True,
            allow_delegated_execution=True,
            risk_level=types.RiskLevel.MEDIUM,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        available = list_available_signals(ctx.dataset)
        if not available:
            inputs.view(
                "no_signals",
                types.Warning(
                    label="No signals yet",
                    description="Run 'Image Link Lab: compute signals' first",
                ),
            )
            return types.Property(inputs)

        scopes = _scope_choices(ctx)
        inputs.enum(
            "query_scope",
            scopes.values(),
            default=SCOPE_VIEW,
            label="Query images",
            view=scopes,
        )
        inputs.enum(
            "pool_scope",
            scopes.values(),
            default=SCOPE_DATASET,
            label="Match against",
            view=scopes,
        )

        for s in available:
            name = s["name"]
            inputs.bool("use_" + name, default=True, label="Use %s" % name)
            if ctx.params.get("use_" + name, True):
                if s["kind"] == "hash":
                    inputs.int(
                        "threshold_" + name,
                        default=default_threshold(s),
                        label="%s: max bit distance" % name,
                        min=0,
                        max=s["bits"],
                    )
                else:
                    inputs.float(
                        "threshold_" + name,
                        default=default_threshold(s),
                        label="%s: min cosine similarity" % name,
                        min=-1.0,
                        max=1.0,
                    )

        fusions = types.RadioGroup()
        for f in FUSIONS:
            fusions.add_choice(f, label=f.upper())

        inputs.enum("fusion", fusions.values(), default="or", view=fusions)
        if ctx.params.get("fusion") == "weighted":
            inputs.float(
                "cutoff", default=0.75, label="Weighted score cutoff", min=0, max=1
            )

        inputs.int("top_k", default=DEFAULT_TOP_K, label="Candidates per signal", min=1)

        fields = _field_choices(ctx)
        for role, label, description in _FIELD_ROLES:
            inputs.enum(
                "field_" + role,
                fields.values(),
                required=False,
                label=label,
                description=description,
                view=fields,
            )

        if ctx.params.get("field_time"):
            inputs.bool("direction", default=True, label="Earlier image is the parent")
            inputs.bool("one_parent", default=False, label="One parent per image")

        inputs.str("run_name", required=False, label="Run name")
        return types.Property(inputs, view=types.View(label="Run link rule"))

    def execute(self, ctx):
        params = build_params(ctx.params, list_available_signals(ctx.dataset))
        run = run_link_rule(
            ctx, params, progress=lambda p, label: ctx.set_progress(p, label)
        )
        metrics = run.get("metrics") or {}
        return {
            "run_id": run["run_id"],
            "links_field": run["links_field"],
            "links": metrics.get("links"),
            "precision": metrics.get("precision"),
            "recall": metrics.get("recall"),
            "f1": metrics.get("f1"),
        }

    def resolve_output(self, ctx):
        outputs = types.Object()
        outputs.str("run_id", label="Run ID")
        outputs.str("links_field", label="Links field")
        outputs.int("links", label="Links")
        outputs.float("precision", label="Precision")
        outputs.float("recall", label="Recall")
        outputs.float("f1", label="F1")
        return types.Property(outputs)


def build_params(form, available):
    """Converts flat operator form values into run parameters.

    Args:
        form: the operator's ``ctx.params``
        available: the list returned by
            :func:`image_link_lab.engine.list_available_signals`

    Returns:
        a run parameters dict
    """
    signals = [
        {
            "name": s["name"],
            "threshold": form.get("threshold_" + s["name"], default_threshold(s)),
        }
        for s in available
        if form.get("use_" + s["name"], True)
    ]

    fields = {role: form.get("field_" + role) for role, _, _ in _FIELD_ROLES}
    return {
        "run_name": form.get("run_name"),
        "scope": {
            "query": form.get("query_scope", SCOPE_VIEW),
            "pool": form.get("pool_scope", SCOPE_DATASET),
        },
        "fields": {k: v for k, v in fields.items() if v},
        "top_k": form.get("top_k", DEFAULT_TOP_K),
        "rule": {
            "signals": signals,
            "fusion": form.get("fusion", "or"),
            "cutoff": form.get("cutoff", 0.75),
            "direction": bool(form.get("direction")) and bool(fields["time"]),
            "one_parent": bool(form.get("one_parent")) and bool(fields["time"]),
        },
    }


def scope_options(dataset):
    """Returns the scope choices for a dataset.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`

    Returns:
        a list of ``(value, label)`` tuples
    """
    return [(SCOPE_VIEW, "Current view"), (SCOPE_DATASET, "Whole dataset")] + [
        (SCOPE_TAG_PREFIX + tag, "Tag: %s" % tag)
        for tag in sorted(dataset.distinct("tags"))
    ]


def field_options(dataset):
    """Returns the top-level fields a field picker can offer.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`

    Returns:
        a list of field names
    """
    skip = {"id", "filepath", "tags", "metadata", "created_at", "last_modified_at"}
    return [
        name
        for name in dataset.get_field_schema()
        if name not in skip
        and not name.startswith((HASH_FIELD_PREFIX, LINKS_FIELD_PREFIX))
    ]


def _scope_choices(ctx):
    choices = types.Dropdown()
    for value, label in scope_options(ctx.dataset):
        choices.add_choice(value, label=label)

    return choices


def _field_choices(ctx):
    choices = types.Dropdown()
    for name in field_options(ctx.dataset):
        choices.add_choice(name, label=name)

    return choices
