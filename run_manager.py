"""
Persistence for link runs.

Runs live in a dataset-scoped execution store, so every App session on the
dataset sees the same history and SSE subscribers are notified on change.
"""
import logging
import uuid
from datetime import datetime, timezone

from bson import ObjectId

from fiftyone.operators.store import ExecutionStore

from .constants import STORE_NAME, RunStatus

logger = logging.getLogger(__name__)


def get_store(ctx):
    """Returns the plugin's execution store for the current dataset.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`

    Returns:
        an :class:`fiftyone.operators.store.ExecutionStore`
    """
    return ExecutionStore.create(STORE_NAME, ObjectId(str(ctx.dataset._doc.id)))


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class RunManager(object):
    """Creates, lists, updates and deletes link runs.

    Args:
        ctx: an :class:`fiftyone.operators.ExecutionContext`
    """

    _RUN_PREFIX = "run:"

    # Too large for listing; only needed by get_run()
    _HEAVY_FIELDS = {"group_matrix", "misses"}

    def __init__(self, ctx):
        self._store = get_store(ctx)

    def create_run(self, params):
        """Creates a pending run.

        Args:
            params: the run parameters, with at least ``rule`` and ``scope``

        Returns:
            the run dict
        """
        run_id = str(uuid.uuid4())
        now = now_iso()
        run = {
            "run_id": run_id,
            "run_name": params.get("run_name") or "Run %s" % now[:16].replace("T", " "),
            "status": RunStatus.PENDING.value,
            "rule": _require(params, "rule"),
            "rule_text": params.get("rule_text"),
            "scope": _require(params, "scope"),
            "fields": params.get("fields") or {},
            "top_k": params.get("top_k"),
            "metrics": None,
            "links_field": None,
            "num_queries": None,
            "num_pool": None,
            "group_matrix": None,
            "misses": None,
            "creation_time": now,
            "start_time": None,
            "end_time": None,
            "status_details": None,
        }
        self.set_run(run_id, run)
        return run

    def get_run(self, run_id):
        """Gets a run, including its heavy fields.

        Args:
            run_id: the run ID

        Returns:
            the run dict, or None
        """
        return self._store.get(self._key(run_id))

    def set_run(self, run_id, run):
        """Writes a full run record.

        Args:
            run_id: the run ID
            run: the run dict
        """
        self._store.set(self._key(run_id), run)

    def update_run(self, run_id, updates):
        """Updates fields on an existing run.

        Args:
            run_id: the run ID
            updates: a dict of fields to update
        """
        run = self.get_run(run_id)
        if not run:
            logger.warning("Attempted to update non-existent run %s", run_id)
            return

        run.update(updates)
        self.set_run(run_id, run)

    def delete_run(self, run_id):
        """Deletes a run.

        Args:
            run_id: the run ID

        Returns:
            the deleted run dict, or None
        """
        run = self.get_run(run_id)
        if not run:
            return None

        self._store.delete(self._key(run_id))
        return run

    def list_runs(self):
        """Lists runs, newest first, without their heavy fields.

        Returns:
            a list of run dicts
        """
        runs = []
        for key in self._store.list_keys():
            if not key.startswith(self._RUN_PREFIX):
                continue

            run = self._store.get(key)
            if run:
                runs.append(
                    {k: v for k, v in run.items() if k not in self._HEAVY_FIELDS}
                )

        runs.sort(key=lambda r: r.get("creation_time", ""), reverse=True)
        return runs

    def _key(self, run_id):
        return self._RUN_PREFIX + run_id


def _require(params, key):
    value = params.get(key)
    if not value:
        raise ValueError("'%s' is required" % key)

    return value
