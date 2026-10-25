import os, sys, tempfile, unittest
from pathlib import Path
from freecode import storage


class DriverDirTest(unittest.TestCase):
    def test_side_loaded_driver_folder_is_used(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "fw_fake_driver_mod.py").write_text("X = 1\n", encoding="utf-8")
            try:
                self.assertEqual(storage._add_driver_dir({"FW_PYDEPS": d}), d)
                import fw_fake_driver_mod
                self.assertEqual(fw_fake_driver_mod.X, 1)
                self.assertIsNone(storage._add_driver_dir({"FW_PYDEPS": d}))  # not added twice
            finally:
                if d in sys.path:
                    sys.path.remove(d)
                sys.modules.pop("fw_fake_driver_mod", None)

    def test_missing_folder_is_ignored(self):
        self.assertIsNone(storage._add_driver_dir({"FW_PYDEPS": os.path.join(tempfile.gettempdir(), "fw-no-such-dir")}))

    def test_secret_files_are_gitignored(self):
        text = (Path(__file__).resolve().parents[2] / ".gitignore").read_text(encoding="utf-8").split()
        self.assertIn("*.secret", text)
        self.assertIn("pydeps/", text)


if __name__ == "__main__":
    unittest.main()
