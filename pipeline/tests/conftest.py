"""
Shared pytest fixtures for pipeline tests.
"""
import sys
from pathlib import Path

import pytest

# Ensure the pipeline root is on the Python path so tests can import
# from transform/, scripts/, config.py, etc.
PIPELINE_ROOT = Path(__file__).resolve().parent.parent
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))
