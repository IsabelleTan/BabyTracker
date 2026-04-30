from datetime import datetime, timezone
from app.utils import _utc, pair_sleep_sessions, NIGHT_SHIFT_START, NIGHT_SHIFT_END


def test_utc_aware_passthrough():
    dt = datetime(2024, 1, 1, tzinfo=timezone.utc)
    assert _utc(dt) is dt


def test_utc_naive_gets_utc():
    dt = datetime(2024, 1, 1)
    result = _utc(dt)
    assert result.tzinfo == timezone.utc
    assert result.replace(tzinfo=None) == dt


def test_night_shift_constants():
    assert NIGHT_SHIFT_START == 21
    assert NIGHT_SHIFT_END == 7


def test_pair_empty():
    assert pair_sleep_sessions([]) == []


def test_pair_single_complete_session():
    start = datetime(2024, 1, 1, 10, tzinfo=timezone.utc)
    end = datetime(2024, 1, 1, 11, tzinfo=timezone.utc)
    assert pair_sleep_sessions([("sleep_start", start), ("sleep_end", end)]) == [(start, end)]


def test_pair_multiple_sessions():
    s1 = datetime(2024, 1, 1, 8, tzinfo=timezone.utc)
    e1 = datetime(2024, 1, 1, 9, tzinfo=timezone.utc)
    s2 = datetime(2024, 1, 1, 13, tzinfo=timezone.utc)
    e2 = datetime(2024, 1, 1, 14, tzinfo=timezone.utc)
    result = pair_sleep_sessions([
        ("sleep_start", s1), ("sleep_end", e1),
        ("sleep_start", s2), ("sleep_end", e2),
    ])
    assert result == [(s1, e1), (s2, e2)]


def test_pair_open_session_at_end_is_ignored():
    start = datetime(2024, 1, 1, 10, tzinfo=timezone.utc)
    assert pair_sleep_sessions([("sleep_start", start)]) == []


def test_pair_end_without_start_is_ignored():
    end = datetime(2024, 1, 1, 11, tzinfo=timezone.utc)
    assert pair_sleep_sessions([("sleep_end", end)]) == []


def test_pair_second_start_before_end_replaces_open():
    """A second sleep_start while one is open replaces the pending start."""
    s1 = datetime(2024, 1, 1, 8, tzinfo=timezone.utc)
    s2 = datetime(2024, 1, 1, 9, tzinfo=timezone.utc)
    end = datetime(2024, 1, 1, 10, tzinfo=timezone.utc)
    result = pair_sleep_sessions([("sleep_start", s1), ("sleep_start", s2), ("sleep_end", end)])
    # s2 is the active start because it replaced s1
    assert result == [(s2, end)]


# ── output_at_accident ────────────────────────────────────────────────────────

from app.utils import output_at_accident


def test_output_at_accident_returns_true_for_accident():
    assert output_at_accident({"location": "accident"}) is True


def test_output_at_accident_returns_false_for_diaper():
    assert output_at_accident({"location": "diaper"}) is False


def test_output_at_accident_returns_false_for_potty():
    assert output_at_accident({"location": "potty"}) is False


def test_output_at_accident_defaults_to_false_when_missing():
    assert output_at_accident({}) is False
