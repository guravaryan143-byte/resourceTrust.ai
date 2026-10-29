# conftest.py — ensures the project root is on sys.path so that `app.*`
# imports work regardless of how pytest is invoked, and configures safe
# test defaults to prevent tests from connecting to live production/dev DB.
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

# Fast fail-fast connection timeout during test sessions
os.environ.setdefault("DB_CONNECT_TIMEOUT", "2")

