"""
Image Link Lab panel.

Python owns state, persistence and compute; the ``LinkLabView`` React
component (``js/src``) draws the UI with VOODO and calls the methods passed
in :meth:`LinkLabPanel.render`.
"""
import logging
import uuid

import fiftyone.operators as foo
import fiftyone.operators.types as types
import fiftyone.zoo as foz
from fiftyone import ViewField as F

from ..constants import (
    DEFAULT_TOP_K,
    FORM_KEY,
    SCOPE_DATASET,
    SCOPE_VIEW,
    SIGNALS_PROGRESS_KEY,
    RunStatus,
)
from ..engine import (
    default_threshold,
    delete_run_links,
    get_sample_links,
    links_view,
    list_available_signals,
    misses_view,
    pair_signals,
    run_link_rule,
)
from ..operators.run_rule import field_options, scope_options
from ..run_manager import RunManager, get_store

logger = logging.getLogger(__name__)


class LinkLabPanel(foo.Panel):
    @property
    def config(self):
        return foo.PanelConfig(
            name="link_lab",
            label="Image Link Lab",
            icon="hub",
            surfaces="grid",
            help_markdown=(
                "Combine hash and embedding signals with your own rule, score "
                "it against a truth field, and inspect the evidence behind "
                "every link"
            ),
        )

    # -- Lifecycle --

    def on_load(self, ctx):
        self._refresh_options(ctx)
        self._refresh_runs(ctx)
        ctx.panel.set_data(
            "embedding_models", foz.list_zoo_models(tags="embeddings")
        )

        form = get_store(ctx).get(FORM_KEY)
        ctx.panel.set_data("form", form or self._default_form(ctx))

        run_id = ctx.panel.get_state("applied_run_id")
        if run_id:
            self._apply(ctx, run_id, notify=False)

    def on_change_selected(self, ctx):
        self._update_evidence(ctx)

    # -- Methods exposed to the frontend --

    def compute_signals(self, ctx):
        params = ctx.params.get("params") or {}
        delegate = bool(params.get("delegate"))
        progress = {
            "state": "queued" if delegate else "running",
            "progress": 0,
            "label": "Waiting for the orchestrator" if delegate else "Starting",
        }
        get_store(ctx).set(SIGNALS_PROGRESS_KEY, progress)
        ctx.panel.set_data("signals_progress", progress)
        ctx.trigger(
            "@harpreetsahota/image_link_lab/compute_signals",
            params=dict(params, delegate=delegate, from_panel=True),
        )

    def refresh(self, ctx):
        """Re-reads signals, options and runs (after compute_signals or an
        SSE store change)."""
        self._refresh_options(ctx)
        self._refresh_runs(ctx)

    def list_runs(self, ctx):
        self._refresh_runs(ctx)

    def run_rule(self, ctx):
        params = ctx.params.get("params") or {}
        form = ctx.params.get("form")
        if form:
            get_store(ctx).set(FORM_KEY, form)

        try:
            run = run_link_rule(ctx, params)
        except Exception as e:
            ctx.ops.notify("Run failed: %s" % e, variant="error")
            self._refresh_runs(ctx)
            return

        self._refresh_runs(ctx)
        self._apply(ctx, run["run_id"], notify=False)

        metrics = run.get("metrics") or {}
        if "recall" in metrics:
            msg = "%s: %d links, precision %.0f%%, recall %.0f%%" % (
                run["run_name"],
                metrics["links"],
                100 * metrics["precision"],
                100 * metrics["recall"],
            )
        else:
            msg = "%s: %d links" % (run["run_name"], metrics.get("links", 0))

        ctx.ops.notify(msg, variant="success")

    def apply_run(self, ctx):
        self._apply(ctx, ctx.params.get("run_id"))

    def clone_run(self, ctx):
        run = RunManager(ctx).get_run(ctx.params.get("run_id"))
        if not run:
            ctx.ops.notify("Run not found", variant="error")
            return

        form = _form_from_run(run, list_available_signals(ctx.dataset))
        ctx.panel.set_data("clone_form", dict(form, nonce=uuid.uuid4().hex))

    def rename_run(self, ctx):
        run_id = ctx.params.get("run_id")
        new_name = (ctx.params.get("new_name") or "").strip()
        if not new_name:
            ctx.ops.notify("Name cannot be empty", variant="error")
            return

        manager = RunManager(ctx)
        if not manager.get_run(run_id):
            ctx.ops.notify("Run not found", variant="error")
            return

        manager.update_run(run_id, {"run_name": new_name})
        self._refresh_runs(ctx)
        if ctx.panel.get_state("applied_run_id") == run_id:
            self._apply(ctx, run_id, notify=False)

    def delete_run(self, ctx):
        run_id = ctx.params.get("run_id")
        run = RunManager(ctx).delete_run(run_id)
        if run:
            delete_run_links(ctx, run)
            if run_id == ctx.panel.get_state("applied_run_id"):
                ctx.panel.set_state("applied_run_id", None)
                ctx.panel.set_data("active_run", None)
                ctx.panel.set_data("evidence", None)

        self._refresh_runs(ctx)
        ctx.ops.notify(
            "Deleted 1 run" if run else "Deleted 0 runs", variant="success"
        )

    def open_misses(self, ctx):
        run = RunManager(ctx).get_run(ctx.params.get("run_id"))
        if not run:
            return

        view = misses_view(ctx, run, ctx.params.get("row"), ctx.params.get("group"))
        ctx.ops.set_view(view)

    def open_links(self, ctx):
        run = RunManager(ctx).get_run(ctx.params.get("run_id"))
        sample_id = ctx.params.get("sample_id")
        if run and sample_id:
            ctx.ops.set_view(links_view(ctx, run, sample_id))

    def show_queries(self, ctx):
        run = RunManager(ctx).get_run(ctx.params.get("run_id"))
        field = run and run.get("links_field")
        if field and ctx.dataset.has_sample_field(field):
            ctx.ops.set_view(ctx.dataset.exists(field))

    # -- Render --

    def render(self, ctx):
        return types.Property(
            types.Object(),
            view=types.View(
                component="LinkLabView",
                composite_view=True,
                compute_signals=self.compute_signals,
                refresh=self.refresh,
                list_runs=self.list_runs,
                run_rule=self.run_rule,
                apply_run=self.apply_run,
                clone_run=self.clone_run,
                rename_run=self.rename_run,
                delete_run=self.delete_run,
                open_misses=self.open_misses,
                open_links=self.open_links,
                show_queries=self.show_queries,
            ),
        )

    # -- Helpers --

    def _refresh_options(self, ctx):
        ctx.panel.set_data("signals", list_available_signals(ctx.dataset))
        ctx.panel.set_data(
            "scope_options",
            [
                {"value": value, "label": label}
                for value, label in scope_options(ctx.dataset)
            ],
        )
        ctx.panel.set_data("field_options", field_options(ctx.dataset))
        ctx.panel.set_data(
            "signals_progress", get_store(ctx).get(SIGNALS_PROGRESS_KEY)
        )

    def _refresh_runs(self, ctx):
        ctx.panel.set_data("runs", RunManager(ctx).list_runs())

    def _apply(self, ctx, run_id, notify=True):
        run = RunManager(ctx).get_run(run_id) if run_id else None
        if not run:
            ctx.panel.set_state("applied_run_id", None)
            ctx.panel.set_data("active_run", None)
            if notify:
                ctx.ops.notify("Run not found", variant="error")
            return

        if run.get("status") != RunStatus.COMPLETED.value:
            if notify:
                ctx.ops.notify("Run is not completed", variant="warning")
            return

        run = {k: v for k, v in run.items() if k != "misses"}
        ctx.panel.set_state("applied_run_id", run_id)
        ctx.panel.set_data("active_run", run)
        self._update_evidence(ctx)

    def _update_evidence(self, ctx):
        run_id = ctx.panel.get_state("applied_run_id")
        selected = list(ctx.selected or [])
        if not run_id or len(selected) != 1:
            ctx.panel.set_data("evidence", None)
            return

        run = RunManager(ctx).get_run(run_id)
        if not run:
            ctx.panel.set_data("evidence", None)
            return

        try:
            ctx.panel.set_data("evidence", _build_evidence(ctx, run, selected[0]))
        except Exception as e:
            logger.warning("Failed to build evidence: %s", e)
            ctx.panel.set_data("evidence", None)

    def _default_form(self, ctx):
        return {
            "query_scope": SCOPE_VIEW,
            "pool_scope": SCOPE_DATASET,
            "signals": [
                _form_signal(s, enabled=True)
                for s in list_available_signals(ctx.dataset)
            ],
            "fusion": "or",
            "cutoff": 0.75,
            "direction": False,
            "one_parent": False,
            "top_k": DEFAULT_TOP_K,
            "fields": {"id": None, "truth": None, "group": None, "time": None},
        }


def _form_signal(signal, enabled):
    return {
        "name": signal["name"],
        "enabled": enabled,
        "threshold": signal.get("threshold", default_threshold(signal)),
        "weight": signal.get("weight", 1.0),
    }


def _form_from_run(run, available):
    rule = run.get("rule") or {}
    fields = run.get("fields") or {}
    used = rule.get("signals", [])
    used_names = {s["name"] for s in used}
    signals = [_form_signal(s, enabled=True) for s in used] + [
        _form_signal(s, enabled=False)
        for s in available
        if s["name"] not in used_names
    ]

    return {
        "query_scope": run["scope"].get("query", SCOPE_VIEW),
        "pool_scope": run["scope"].get("pool", SCOPE_DATASET),
        "signals": signals,
        "fusion": rule.get("fusion", "or"),
        "cutoff": rule.get("cutoff", 0.75),
        "direction": bool(rule.get("direction")),
        "one_parent": bool(rule.get("one_parent")),
        "top_k": run.get("top_k") or DEFAULT_TOP_K,
        "fields": {k: fields.get(k) for k in ("id", "truth", "group", "time")},
        "run_name": "%s (copy)" % run["run_name"],
    }


def _build_evidence(ctx, run, sample_id):
    fields = run.get("fields") or {}
    sample = ctx.dataset[sample_id]
    identity = sample[fields["id"]] if fields.get("id") else sample_id
    truth = sample[fields["truth"]] if fields.get("truth") else None
    signals = (run.get("rule") or {}).get("signals", [])

    links = get_sample_links(ctx, run, sample_id)
    target_sids = [link["sample_id"] for link in links if link.get("sample_id")]
    paths, target_truth = {}, {}
    if target_sids:
        targets = ctx.dataset.select(target_sids)
        ids, fps = targets.values(["id", "filepath"])
        paths = dict(zip(ids, fps))
        if fields.get("truth"):
            target_truth = dict(zip(ids, targets.values(fields["truth"])))

    rows = []
    for link in links:
        verdict = None
        if fields.get("truth"):
            reverse = target_truth.get(link.get("sample_id")) == identity
            verdict = "correct" if link["target_id"] == truth or reverse else "wrong"

        rows.append(dict(link, filepath=paths.get(link.get("sample_id")), verdict=verdict))

    missed = None
    found = any(r["target_id"] == truth for r in rows)
    if truth is not None and not found:
        id_field = fields.get("id")
        match = (
            ctx.dataset.match(F(id_field) == truth)
            if id_field
            else ctx.dataset.select(truth)
        )
        target = match.first() if len(match) else None
        if target is not None:
            missed = {
                "target_id": truth,
                "sample_id": target.id,
                "filepath": target.filepath,
                "verdict": "missed",
                **pair_signals(ctx, signals, sample_id, target.id),
            }

    return {
        "run_id": run["run_id"],
        "sample_id": sample_id,
        "identity": identity,
        "filepath": sample.filepath,
        "truth": truth,
        "is_query": bool(run.get("links_field"))
        and sample.has_field(run["links_field"])
        and sample[run["links_field"]] is not None,
        "signals": [
            {"name": s["name"], "kind": s["kind"], "threshold": s["threshold"]}
            for s in signals
        ],
        "links": rows,
        "missed": missed,
    }
