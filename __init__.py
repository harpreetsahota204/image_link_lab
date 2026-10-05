"""
Image Link Lab plugin.
"""
from .operators.compute_signals import ComputeSignals
from .operators.helpers import (
    LinkLabStoreNotifier,
    OpenLinksInGrid,
    OpenMissesInGrid,
)
from .operators.run_rule import RunRule
from .panels.link_lab import LinkLabPanel


def register(p):
    p.register(ComputeSignals)
    p.register(RunRule)
    p.register(OpenMissesInGrid)
    p.register(OpenLinksInGrid)
    p.register(LinkLabStoreNotifier)
    p.register(LinkLabPanel)
