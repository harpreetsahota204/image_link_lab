"""
Copy Graph panel.

Python loads the graph for the queries in the current grid view and handles
actions; the ``CopyGraphView`` React component (``js/src``) draws it with
VOODO and applies the rule in the browser, so the sliders update the lines
without a server round-trip.
"""
import logging

import fiftyone.core.stages as fosg
import fiftyone.operators as foo
import fiftyone.operators.types as types

from .. import engine
from ..constants import (
    DEFAULT_CLIP_MIN,
    DEFAULT_COMBINE,
    DEFAULT_PHASH_MAX,
    PLUGIN_URI,
)
from ..core import rule as ilr

logger = logging.getLogger(__name__)

_MODEL_EVALUATION_PANEL = "model_evaluation_panel_builtin"


class CopyGraphPanel(foo.Panel):
    @property
    def config(self):
        return foo.PanelConfig(
            name="copy_graph",
            label="Copy Graph",
            icon="hub",
            surfaces="grid",
            help_markdown=(
                "Images in the grid become nodes, the copies the rule finds "
                "become lines. Move the sliders to tune the rule; click a line "
                "to see why it's there"
            ),
        )

    # -- Lifecycle --

    def on_load(self, ctx):
        self._refresh(ctx)

    def on_change_view(self, ctx):
        self._refresh(ctx, graph_only=True)

    def on_change_selected(self, ctx):
        ctx.panel.set_data("selected", [str(s) for s in (ctx.selected or [])])

    def on_change_extended_selection(self, ctx):
        ctx.panel.set_data("extended_selection", _extended_ids(ctx))

    # -- Methods exposed to the frontend --

    def refresh(self, ctx):
        self._refresh(ctx)

    def score_rule(self, ctx):
        """Applies the sliders' rule to the stored candidates, writes the
        results and adds a native evaluation run."""
        settings = engine.load_settings(ctx)
        if not settings:
            ctx.ops.notify("Run 'Find copies' first", variant="warning")
            return

        try:
            rule = ilr.normalize_rule(ctx.params.get("rule") or {})
            summary = engine.apply_rule(ctx, settings, rule)
        except Exception as e:
            logger.warning("Scoring failed: %s", e)
            ctx.ops.notify("Scoring failed: %s" % e, variant="error")
            return

        engine.save_settings(ctx, dict(settings, rule=rule))
        self._refresh(ctx)

        if summary.get("eval_key"):
            ctx.ops.notify(
                "%s: precision %.0f%%, recall %.0f%% (%s)"
                % (
                    summary["rule_text"],
                    100 * summary["precision"],
                    100 * summary["recall"],
                    summary["eval_key"],
                ),
                variant="success",
            )
            ctx.ops.open_panel(_MODEL_EVALUATION_PANEL, is_active=True)
        else:
            ctx.ops.notify(
                "%s: %d of %d images linked to an original"
                % (summary["rule_text"], summary["linked"], summary["queries"]),
                variant="success",
            )

    def filter_grid(self, ctx):
        """Filters the grid to the given samples without changing the view,
        the way the Embeddings panel does, so one click clears it."""
        ids = [str(s) for s in ctx.params.get("ids") or []]
        if ids:
            ctx.ops.show_samples(ids, use_extended_selection=True)

    def clear_filter(self, ctx):
        ctx.ops.set_extended_selection(clear=True)

    def open_sample(self, ctx):
        sample_id = ctx.params.get("id")
        if sample_id:
            ctx.ops.open_sample(id=str(sample_id))

    def run_compute_signals(self, ctx):
        ctx.prompt(PLUGIN_URI + "/compute_signals", on_success=self.refresh)

    def run_find_copies(self, ctx):
        ctx.prompt(PLUGIN_URI + "/find_copies", on_success=self.refresh)

    # -- Render --

    def render(self, ctx):
        return types.Property(
            types.Object(),
            view=types.View(
                component="CopyGraphView",
                composite_view=True,
                refresh=self.refresh,
                score_rule=self.score_rule,
                filter_grid=self.filter_grid,
                clear_filter=self.clear_filter,
                open_sample=self.open_sample,
                run_compute_signals=self.run_compute_signals,
                run_find_copies=self.run_find_copies,
            ),
        )

    # -- Helpers --

    def _refresh(self, ctx, graph_only=False):
        settings = engine.load_settings(ctx) or {}
        if not graph_only:
            signals = engine.signal_status(ctx.dataset)
            has_candidates = bool(settings) and len(
                engine.queries_view(ctx.dataset, settings)
            ) > 0
            ctx.panel.set_data(
                "status",
                {
                    "signals": signals,
                    "candidates": has_candidates,
                    "has_truth": bool(settings.get("truth_field")),
                    "settings": settings,
                    "rule": settings.get("rule")
                    or {
                        "phash_max": DEFAULT_PHASH_MAX,
                        "clip_min": DEFAULT_CLIP_MIN,
                        "combine": DEFAULT_COMBINE,
                    },
                },
            )
            ctx.panel.set_data("selected", [str(s) for s in (ctx.selected or [])])

        extended = _extended_ids(ctx)
        if not graph_only:
            ctx.panel.set_data("extended_selection", extended)
        elif extended and ctx.panel.get_state("has_graph"):
            # The grid was filtered by a click in the graph; the view itself
            # hasn't changed, so keep drawing what's there
            return

        try:
            graph = (
                engine.graph_payload(ctx, settings, view=_view_without_filter(ctx, extended))
                if settings
                else None
            )
        except Exception as e:
            logger.warning("Failed to load graph: %s", e)
            graph = None

        ctx.panel.set_state("has_graph", bool(graph and graph["queries"]))
        ctx.panel.set_data("graph", graph)


def _extended_ids(ctx):
    """Returns the sample IDs in the App's extended selection, or None."""
    selection = ctx.extended_selection
    if isinstance(selection, dict):
        selection = selection.get("selection")

    if not selection:
        return None

    return [str(s) for s in selection]


def _view_without_filter(ctx, extended):
    """The grid applies the extended selection as a ``Select`` stage on the
    view. The graph should keep drawing the whole view while the grid is
    filtered by a click in the graph, so that stage is dropped."""
    view = ctx.view
    if not extended:
        return view

    wanted = set(extended)
    base = ctx.dataset.view()
    for stage in view._stages:
        if isinstance(stage, fosg.Select) and set(map(str, stage.sample_ids)) == wanted:
            continue

        base = base.add_stage(stage)

    return base
