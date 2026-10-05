import numpy as np
import pytest
from PIL import Image

from image_link_lab.core import hashing as ilh


def test_phash_is_16_hex_chars_and_stable_under_small_blur():
    rng = np.random.default_rng(0)
    pixels = rng.integers(0, 255, size=(128, 128, 3), dtype=np.uint8)
    img = Image.fromarray(pixels)
    h = ilh.compute_phash(img)
    assert len(h) == 16
    int(h, 16)

    from PIL import ImageFilter

    blurred = img.filter(ImageFilter.GaussianBlur(1))
    assert ilh.hamming_matrix([h], [ilh.compute_phash(blurred)])[0, 0] < 20


def test_hamming_matrix():
    q = ["0000000000000000", "ffffffffffffffff"]
    p = ["0000000000000000", "00000000000000ff", "ffffffffffffffff"]
    dists = ilh.hamming_matrix(q, p)
    assert dists.tolist() == [[0, 8, 64], [64, 56, 0]]


def test_hamming_matrix_rejects_mixed_lengths():
    with pytest.raises(ValueError):
        ilh.hamming_matrix(["00"], ["0000"])


def test_hex_to_bits_matches_hamming():
    q = ["0f0f0f0f0f0f0f0f"]
    p = ["0000000000000000"]
    bits_q = ilh.hex_to_bits(q)
    bits_p = ilh.hex_to_bits(p)
    assert bits_q.shape == (1, 64)
    assert int(np.abs(bits_q - bits_p).sum()) == ilh.hamming_matrix(q, p)[0, 0] == 32


def test_cosine_matrix():
    q = np.array([[1.0, 0.0], [0.0, 2.0]])
    p = np.array([[2.0, 0.0], [1.0, 1.0], [0.0, 0.0]])
    sims = ilh.cosine_matrix(q, p)
    assert sims.shape == (2, 3)
    assert sims[0, 0] == pytest.approx(1.0)
    assert sims[0, 1] == pytest.approx(np.sqrt(0.5), abs=1e-6)
    assert sims[1, 2] == pytest.approx(0.0)
