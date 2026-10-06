"""
Image Link Lab: find edited copies of images, see the links as a graph,
and read the evidence behind every one.
"""
from .operators.compute_signals import ComputeSignals
from .operators.find_copies import FindCopies
from .panels.image_link_lab import ImageLinkLabPanel


def register(p):
    p.register(ComputeSignals)
    p.register(FindCopies)
    p.register(ImageLinkLabPanel)
