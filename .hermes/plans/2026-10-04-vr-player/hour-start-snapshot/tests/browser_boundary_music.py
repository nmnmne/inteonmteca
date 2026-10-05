"""Compatibility entry point for the updated boundary song + daily bonus checks."""
from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).with_name('browser_boundary_bonus.py')), run_name='__main__')
