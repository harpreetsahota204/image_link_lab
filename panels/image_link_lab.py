"""
Image Link Lab panel.

Python loads the graph for the queries in the current grid view and handles
actions; the ``ImageLinkLabView`` React component (``js/src``) draws it with
VOODO and applies the rule in the browser, so the sliders update the lines
without a server round-trip.
"""
import logging

import fiftyone as fo
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


class ImageLinkLabPanel(foo.Panel):
    @property
    def config(self):
        return foo.PanelConfig(
            name="image_link_lab",
            label="Image Link Lab",
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
        if _get_filter(ctx) and not _showing_filter(ctx):
            # The user moved on (cleared the view bar, picked a saved view);
            # the filter is gone with it
            _set_filter(ctx, None)

        self._refresh(ctx, graph_only=True)

    def on_change_selected(self, ctx):
        ctx.panel.set_data("selected", [str(s) for s in (ctx.selected or [])])

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
        """Shows exactly the given samples in the grid, wherever they live,
        and remembers the view to come back to."""
        ids = [str(s) for s in ctx.params.get("ids") or []]
        if not ids:
            return

        current = _get_filter(ctx)
        # Keep the first base view across successive clicks, so clearing
        # returns to where the user started, not to the previous family
        base = current["base_view"] if current else ctx.view._serialize()
        _set_filter(ctx, {"ids": ids, "base_view": base})
        ctx.ops.set_view(ctx.dataset.select(ids, ordered=True))

    def clear_filter(self, ctx):
        """Puts the grid back to the view it showed before the filter."""
        current = _get_filter(ctx)
        if not current:
            return

        _set_filter(ctx, None)
        if current["base_view"]:
            ctx.ops.set_view(fo.DatasetView._build(ctx.dataset, current["base_view"]))
        else:
            ctx.ops.clear_view()

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
                component="ImageLinkLabView",
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
            has_candidates = bool(settings) and len(
                engine.queries_view(ctx.dataset, settings)
            ) > 0
            ctx.panel.set_data(
                "status",
                {
                    "signals": engine.signal_status(ctx.dataset),
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
            current = _get_filter(ctx)
            ctx.panel.set_data("filter", current["ids"] if current else None)

        view = ctx.view
        if _showing_filter(ctx):
            # The grid is showing a family this panel asked for; the graph
            # stays on the view the user was looking at before
            if graph_only:
                return

            base = _get_filter(ctx)["base_view"]
            view = fo.DatasetView._build(ctx.dataset, base) if base else ctx.dataset.view()

        try:
            graph = engine.graph_payload(ctx, settings, view=view) if settings else None
        except Exception as e:
            logger.warning("Failed to load graph: %s", e)
            graph = None

        ctx.panel.set_data("graph", graph)


# The grid filter is kept in the execution store, not in panel state: panel
# state is written by the browser after the response arrives, so a
# ``set_view`` in the same response can fire ``on_change_view`` before the
# state exists, and the graph would collapse to the filtered view


def _filter_key(ctx):
    return "filter:%s" % ctx.panel_id


def _get_filter(ctx):
    """Returns ``{"ids", "base_view"}`` for this panel's grid filter, or None."""
    return engine.get_store(ctx).get(_filter_key(ctx))


def _set_filter(ctx, value):
    store = engine.get_store(ctx)
    if value is None:
        store.delete(_filter_key(ctx))
    else:
        store.set(_filter_key(ctx), value)

    ctx.panel.set_data("filter", value["ids"] if value else None)


def _showing_filter(ctx):
    """Whether the grid's view is exactly the ``Select`` this panel set."""
    current = _get_filter(ctx)
    stages = ctx.view._stages
    return bool(
        current
        and len(stages) == 1
        and isinstance(stages[0], fosg.Select)
        and set(map(str, stages[0].sample_ids)) == set(current["ids"])
    )
