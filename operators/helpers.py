"""
Unlisted helper operators the panel and agents can call.
"""
import fiftyone.operators as foo
import fiftyone.operators.types as types
from fiftyone.operators.sse import SseOperator, SseOperatorConfig

from ..constants import STORE_NAME
from ..engine import links_view, misses_view
from ..run_manager import RunManager


class OpenMissesInGrid(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="open_misses_in_grid",
            label="Image Link Lab: show missed images",
            description=(
                "Shows the query images whose true link a signal (or the "
                "combined rule) missed for one group, in the sample grid"
            ),
            unlisted=True,
            risk_level=types.RiskLevel.LOW,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("run_id", required=True, label="Run ID")
        inputs.str("row", required=True, label="Signal name, or 'rule'")
        inputs.str("group", required=True, label="Group value")
        return types.Property(inputs)

    def execute(self, ctx):
        run = _get_run(ctx)
        view = misses_view(ctx, run, ctx.params["row"], ctx.params["group"])
        ctx.ops.set_view(view)
        return {"count": len(view)}


class OpenLinksInGrid(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="open_links_in_grid",
            label="Image Link Lab: show links",
            description=(
                "Shows a query image followed by every image a run linked it "
                "to, in the sample grid"
            ),
            unlisted=True,
            risk_level=types.RiskLevel.LOW,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("run_id", required=True, label="Run ID")
        inputs.str("sample_id", required=True, label="Query sample ID")
        return types.Property(inputs)

    def execute(self, ctx):
        run = _get_run(ctx)
        view = links_view(ctx, run, ctx.params["sample_id"])
        ctx.ops.set_view(view)
        return {"count": len(view)}


class LinkLabStoreNotifier(SseOperator):
    @property
    def subscription_config(self):
        return SseOperatorConfig(
            name="link_lab_store_notifier",
            label="Image Link Lab store notifications",
            description=(
                "Streams changes to Image Link Lab runs so open panels refresh"
            ),
            store_name=STORE_NAME,
        )


def _get_run(ctx):
    run = RunManager(ctx).get_run(ctx.params["run_id"])
    if not run:
        raise ValueError("Run '%s' not found" % ctx.params["run_id"])

    return run
