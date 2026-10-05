"""
Image Link Lab constants.
"""
from enum import Enum

STORE_NAME = "image_link_lab"
FORM_KEY = "form:v1"
SIGNALS_STATUS_KEY = "signals:status"
SIGNALS_PROGRESS_KEY = "signals:progress"

HASH_FIELD_PREFIX = "sig_"
LINKS_FIELD_PREFIX = "links_"

DEFAULT_EMBEDDING_MODEL = "clip-vit-base32-torch"
DEFAULT_EMBEDDING_BRAIN_KEY = "sig_clip"

DEFAULT_TOP_K = 10
DEFAULT_HASH_THRESHOLDS = {"phash": 16, "dhash": 16, "pdq": 90}
DEFAULT_EMBEDDING_THRESHOLD = 0.8

# Pairwise matrices are dense, so cap their size to keep runs interactive
MAX_PAIRS = 50_000_000

SCOPE_VIEW = "view"
SCOPE_DATASET = "dataset"
SCOPE_TAG_PREFIX = "tag:"


class RunStatus(str, Enum):
    """Statuses a link run can be in."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
