import numpy as np
import pytest
from PIL import Image

from core import signals


def _image(seed):
    rng = np.random.default_rng(seed)
    return Image.fromarray((rng.random((128, 128, 3)) * 255).astype("uint8"))


@pytest.mark.parametrize("name", signals.HASH_SIGNALS)
def test_hash_length_matches_bits(name):
    h = signals.compute_hash(name, _image(0))
    assert len(h) * 4 == signals.HASH_BITS[name]


@pytest.mark.parametrize("name", signals.HASH_SIGNALS)
def test_flipped_copy_is_further_than_identical_copy(name):
    img = _image(1)
    same = signals.compute_hash(name, img.copy())
    flipped = signals.compute_hash(name, img.transpose(Image.FLIP_LEFT_RIGHT))
    original = signals.compute_hash(name, img)
    d = signals.hamming_matrix([original], [same, flipped])
    assert d[0, 0] == 0
    assert d[0, 1] > 0


def test_unknown_hash_raises():
    with pytest.raises(ValueError):
        signals.compute_hash("ahash", _image(0))


def test_hamming_matrix_counts_bits():
    d = signals.hamming_matrix(["00", "ff"], ["00", "0f", "ff"])
    assert d.tolist() == [[0, 4, 8], [8, 4, 0]]


def test_hamming_matrix_chunks_match_unchunked():
    rng = np.random.default_rng(2)
    q = [rng.bytes(8).hex() for _ in range(7)]
    p = [rng.bytes(8).hex() for _ in range(5)]
    full = signals.hamming_matrix(q, p, chunk_size=100)
    chunked = signals.hamming_matrix(q, p, chunk_size=2)
    assert np.array_equal(full, chunked)


def test_hamming_matrix_rejects_mixed_lengths():
    with pytest.raises(ValueError):
        signals.hamming_matrix(["00"], ["0000"])


def test_cosine_matrix_is_normalized():
    q = np.array([[1.0, 0.0], [3.0, 3.0]])
    p = np.array([[2.0, 0.0], [0.0, 5.0], [0.0, 0.0]])
    sims = signals.cosine_matrix(q, p)
    assert np.allclose(sims[0], [1.0, 0.0, 0.0])
    assert np.allclose(sims[1], [np.sqrt(0.5), np.sqrt(0.5), 0.0])
