import unittest

from server import validate_turf_image


class TurfMediaValidationTests(unittest.TestCase):
    def test_allows_small_jpeg(self):
        self.assertEqual(validate_turf_image("pitch.jpg", "image/jpeg", b"\xff\xd8\xff\xe0"), "jpg")

    def test_rejects_non_images(self):
        with self.assertRaisesRegex(ValueError, "JPEG, PNG or WebP"):
            validate_turf_image("pitch.pdf", "application/pdf", b"%PDF")

    def test_rejects_large_files(self):
        with self.assertRaisesRegex(ValueError, "5 MB"):
            validate_turf_image("pitch.png", "image/png", b"x" * (5 * 1024 * 1024 + 1))
