"""
Tests for utils — batch helper, safe_numeric, safe_int.
"""
import pytest
from utils import batch, safe_numeric, safe_int


class TestBatch:
    def test_even_split(self):
        result = list(batch([1, 2, 3, 4], 2))
        assert result == [[1, 2], [3, 4]]

    def test_uneven_split(self):
        result = list(batch([1, 2, 3, 4, 5], 2))
        assert result == [[1, 2], [3, 4], [5]]

    def test_empty_iterable(self):
        result = list(batch([], 10))
        assert result == []

    def test_single_item(self):
        result = list(batch([1], 5))
        assert result == [[1]]

    def test_chunk_larger_than_input(self):
        result = list(batch([1, 2, 3], 10))
        assert result == [[1, 2, 3]]


class TestSafeNumeric:
    def test_valid_float(self):
        assert safe_numeric("123.45") == 123.45

    def test_valid_int_string(self):
        assert safe_numeric("42") == 42.0

    def test_invalid_string(self):
        assert safe_numeric("abc") is None

    def test_none_value(self):
        assert safe_numeric(None) is None

    def test_empty_string(self):
        assert safe_numeric("") is None

    def test_whitespace_string(self):
        assert safe_numeric("  ") is None


class TestSafeInt:
    def test_valid_int(self):
        assert safe_int("42") == 42

    def test_invalid_string(self):
        assert safe_int("abc") is None

    def test_none_value(self):
        assert safe_int(None) is None

    def test_empty_string(self):
        assert safe_int("") is None

    def test_float_string(self):
        assert safe_int("3.14") is None
