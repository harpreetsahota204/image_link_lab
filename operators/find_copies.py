"""
Step 2: find each query's original and score the rule.

Gathers candidates once (the slow part), applies the rule, writes
``copy_of`` and, if a truth field is set, a native binary evaluation. The
Copy Graph panel calls the same :func:`engine.apply_rule` with the sliders'
values, so re-scoring a new rule takes a second.
"""
import fiftyone.operators as foo
import fiftyone.operators.types as types

from .. import engine
from ..constants import (
    DEFAULT_CLIP_MIN,
    DEFAULT_COMBINE,
    DEFAULT_PHASH_MAX,
    OUTPUT_FIELD,
    PHASH_BITS,
    PLUGIN_URI,
    SCOPE_DATASET,
    SCOPE_VIEW,
)
from ..core import rule as ilr

_PANEL_NAME = "copy_graph"


class FindCopies(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="find_copies",
            label="Copy Graph: find copies",
            description=(
                "Links each query image to the original it was copied from, "
                "using pHash and CLIP combined by a rule you set, and scores "
                "the rule against a truth field if you have one"
            ),
            icon="hub",
            dynamic=True,
            allow_immediate_execution=True,
            allow_delegated_execution=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        status = engine.signal_status(ctx.dataset)
        if not all(status.values()):
            missing = [k for k, ok in status.items() if not ok]
            inputs.view(
                "no_signals",
                types.Warning(
                    label="Signals not computed yet: %s" % ", ".join(missing),
                    description="Compute them first, then come back here",
                ),
            )
            inputs.view(
                "compute",
                types.ButtonView(
                    label="Compute signals",
                    operator=PLUGIN_URI + "/compute_signals",
                    variant="contained",
                ),
            )
            return types.Property(inputs, view=types.View(label="Find copies"))

        saved = engine.load_settings(ctx) or {}
        has_candidates = len(engine.queries_view(ctx.dataset, saved)) > 0 if saved else False

        inputs.view(
            "images_header",
            types.Header(
                label="Images",
                description="Which images are copies to explain, and where their originals might be",
            ),
        )
        scopes = _dropdown(engine.scope_choices(ctx.dataset))
        inputs.enum(
            "queries",
            scopes.values(),
            default=saved.get("queries", SCOPE_VIEW),
            label="Query images",
            description="The images to find originals for",
            view=scopes,
        )
        inputs.enum(
            "originals",
            scopes.values(),
            default=saved.get("originals", SCOPE_DATASET),
            label="Candidate originals",
            description="Where to look for each query's original",
            view=scopes,
        )
        fields = _dropdown([(f, f) for f in engine.field_choices(ctx.dataset)], none=True)
        inputs.enum(
            "id_field",
            fields.values(),
            default=saved.get("id_field") or _NONE,
            label="ID field (optional)",
            description="Each image's identity, if not its sample ID",
            view=fields,
        )
        inputs.enum(
            "truth_field",
            fields.values(),
            default=saved.get("truth_field") or _NONE,
            label="Truth field (optional)",
            description=(
                "Identity of each query's known original. Turns on scoring "
                "and right/wrong colors in the graph"
            ),
            view=fields,
        )

        inputs.view(
            "rule_header",
            types.Header(
                label="Rule",
                description="A pair is a copy when the signals say so. Tune it live in the Copy Graph panel afterwards",
            ),
        )
        rule = saved.get("rule") or {}
        inputs.int(
            "phash_max",
            default=rule.get("phash_max", DEFAULT_PHASH_MAX),
            label="pHash limit",
            description="Link when at most this many of the %d hash bits differ. Lower is stricter"
            % PHASH_BITS,
            min=0,
            max=PHASH_BITS,
        )
        inputs.float(
            "clip_min",
            default=rule.get("clip_min", DEFAULT_CLIP_MIN),
            label="CLIP limit",
            description="Link when the embedding similarity is at least this (0 to 1). Higher is stricter",
            min=0.0,
            max=1.0,
        )
        combine = types.RadioGroup(orientation="horizontal")
        combine.add_choice("any", label="Either signal is enough")
        combine.add_choice("all", label="Both must agree")
        inputs.enum(
            "combine",
            combine.values(),
            default=rule.get("combine", DEFAULT_COMBINE),
            label="Combine",
            view=combine,
        )

        inputs.str(
            "output_field",
            default=saved.get("output_field", OUTPUT_FIELD),
            label="Output field",
            description="Gets a label per query: the original's identity, or none",
        )
        if has_candidates:
            inputs.bool(
                "recompute",
                default=False,
                label="Re-gather candidates",
                description=(
                    "Candidates from the last run are reused unless the images "
                    "or fields above changed. Tick to force a refresh"
                ),
            )

        return types.Property(inputs, view=types.View(label="Find copies"))

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate")

    def execute(self, ctx):
        p = ctx.params
        settings = {
            "queries": p.get("queries", SCOPE_VIEW),
            "originals": p.get("originals", SCOPE_DATASET),
            "id_field": _none(p.get("id_field")),
            "truth_field": _none(p.get("truth_field")),
            "output_field": p.get("output_field") or OUTPUT_FIELD,
        }
        rule = ilr.normalize_rule(
            {
                "phash_max": p.get("phash_max", DEFAULT_PHASH_MAX),
                "clip_min": p.get("clip_min", DEFAULT_CLIP_MIN),
                "combine": p.get("combine", DEFAULT_COMBINE),
            }
        )

        def progress(fraction, label):
            if ctx.delegated:
                ctx.set_progress(progress=fraction, label=label)

        saved = engine.load_settings(ctx) or {}
        same_scope = all(saved.get(k) == settings[k] for k in settings)
        reuse = (
            same_scope
            and not p.get("recompute")
            and len(engine.queries_view(ctx.dataset, settings)) > 0
        )
        if not reuse:
            engine.gather_candidates(ctx, settings, progress=lambda f, l: progress(0.7 * f, l))

        summary = engine.apply_rule(
            ctx, settings, rule, progress=lambda f, l: progress(0.7 + 0.3 * f, l)
        )
        engine.save_settings(ctx, dict(settings, rule=rule))

        if not ctx.delegated:
            # Show the result in the grid, not the evaluation plumbing
            ctx.ops.set_active_fields([settings["output_field"]])
            ctx.ops.open_panel(_PANEL_NAME, is_active=True)

        return summary

    def resolve_output(self, ctx):
        outputs = types.Object()
        outputs.str("rule_text", label="Rule")
        outputs.int("queries", label="Queries")
        outputs.int("linked", label="Linked to an original")
        if ctx.results and ctx.results.get("eval_key"):
            outputs.int("right", label="Right links")
            outputs.int("wrong", label="Wrong links")
            outputs.int("missed", label="Missed originals")
            outputs.float("precision", label="Precision")
            outputs.float("recall", label="Recall")
            outputs.str("eval_key", label="Evaluation key (see Model Evaluation)")

        return types.Property(outputs, view=types.View(label="Copies found"))


_NONE = "__none__"


def _none(value):
    return None if value in (None, "", _NONE) else value


def _dropdown(choices, none=False):
    dropdown = types.Dropdown()
    if none:
        dropdown.add_choice(_NONE, label="None")

    for value, label in choices:
        dropdown.add_choice(value, label=label)

    return dropdown
