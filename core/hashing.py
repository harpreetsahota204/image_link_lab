"""
Perceptual hashing and pairwise distances.

No FiftyOne imports: these functions work on PIL images, hex strings and
numpy arrays so they can be unit-tested and reused in a notebook.
"""
import numpy as np

_POPCOUNT_U8 = np.array([bin(i).count("1") for i in range(256)], dtype=np.uint8)


def compute_phash(image):
    """Computes the 64-bit perceptual hash of an image.

    Args:
        image: a ``PIL.Image.Image``

    Returns:
        the hash as a 16-character lowercase hex string
    """
    import imagehash

    return str(imagehash.phash(image))


def hex_to_bytes(hashes):
    """Converts hex hash strings to a uint8 matrix.

    Args:
        hashes: a list of equal-length hex strings

    Returns:
        a ``num_hashes x num_bytes`` uint8 array
    """
    if not hashes:
        return np.zeros((0, 0), dtype=np.uint8)

    return np.frombuffer(
        b"".join(bytes.fromhex(h) for h in hashes), dtype=np.uint8
    ).reshape(len(hashes), -1)


def hex_to_bits(hashes):
    """Converts hex hash strings to a float32 matrix of 0/1 bits, suitable
    for a native similarity index.

    Args:
        hashes: a list of equal-length hex strings

    Returns:
        a ``num_hashes x num_bits`` float32 array
    """
    return np.unpackbits(hex_to_bytes(hashes), axis=1).astype(np.float32)


def hamming_matrix(query_hashes, pool_hashes, chunk_size=256):
    """Computes pairwise Hamming distances between two sets of hashes.

    Args:
        query_hashes: a list of hex strings
        pool_hashes: a list of hex strings of the same length as the queries
        chunk_size (256): number of query rows to process at a time

    Returns:
        a ``num_queries x num_pool`` int32 array of differing bits
    """
    q = hex_to_bytes(query_hashes)
    p = hex_to_bytes(pool_hashes)
    if q.size and p.size and q.shape[1] != p.shape[1]:
        raise ValueError("Query and pool hashes have different lengths")

    dists = np.zeros((len(query_hashes), len(pool_hashes)), dtype=np.int32)
    for start in range(0, len(q), chunk_size):
        xor = np.bitwise_xor(q[start : start + chunk_size, None, :], p[None])
        dists[start : start + chunk_size] = _POPCOUNT_U8[xor].sum(
            axis=-1, dtype=np.int32
        )

    return dists


def cosine_matrix(query_embeddings, pool_embeddings):
    """Computes pairwise cosine similarities between two embedding sets.

    Args:
        query_embeddings: a ``num_queries x dim`` array
        pool_embeddings: a ``num_pool x dim`` array

    Returns:
        a ``num_queries x num_pool`` float32 array in ``[-1, 1]``
    """
    q = _l2_normalize(np.asarray(query_embeddings, dtype=np.float32))
    p = _l2_normalize(np.asarray(pool_embeddings, dtype=np.float32))
    return q @ p.T


def _l2_normalize(x):
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return x / norms
