"""
Image Link Lab constants.
"""

PLUGIN_URI = "@harpreetsahota/image_link_lab"
STORE_NAME = "image_link_lab"
SETTINGS_KEY = "image_link_lab"

# Signals
PHASH_FIELD = "phash"
PHASH_BRAIN_KEY = "phash"
PHASH_BITS = 64
CLIP_BRAIN_KEY = "clip"
CLIP_MODEL = "clip-vit-base32-torch"

# Results written by find_copies
OUTPUT_FIELD = "copy_of"
CANDIDATES_SUFFIX = "_candidates"
GT_SUFFIX = "_gt"
PRED_SUFFIX = "_pred"

# Binary evaluation labels
COPY = "copy"
UNIQUE = "unique"
NONE_LABEL = "none"

# Candidate gathering
CANDIDATES_PER_SIGNAL = 5

# Starting rule
DEFAULT_PHASH_MAX = 10
DEFAULT_CLIP_MIN = 0.90
DEFAULT_COMBINE = "any"

# Scopes
SCOPE_VIEW = "view"
SCOPE_DATASET = "dataset"
SCOPE_TAG_PREFIX = "tag:"

# The graph draws at most this many queries at once
MAX_GRAPH_QUERIES = 40
