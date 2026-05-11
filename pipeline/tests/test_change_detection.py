from enrich.change_detection import detect_change_points, analyze_committee_changes


def test_detect_change_points_flat_signal():
    """Flat signal should have no change points."""
    values = [100.0] * 20
    cps = detect_change_points(values)
    assert len(cps) == 0


def test_detect_change_points_step_change():
    """Step change should be detected."""
    values = [100.0] * 10 + [500.0] * 10
    cps = detect_change_points(values)
    assert len(cps) >= 1
    # Change point should be near index 10
    assert any(8 <= cp <= 12 for cp in cps)


def test_detect_change_points_too_short():
    """Too-short series should return empty."""
    cps = detect_change_points([1, 2, 3])
    assert cps == []


def test_analyze_committee_no_changes():
    """Stable committee should have no changes."""
    series = [{"month": f"2025-{m:02d}", "total": 10000.0, "count": 20} for m in range(1, 13)]
    changes = analyze_committee_changes("C001", series)
    assert len(changes) == 0


def test_analyze_committee_with_spike():
    """Committee with spending spike should detect a change."""
    series = [{"month": f"2025-{m:02d}", "total": 10000.0, "count": 20} for m in range(1, 7)]
    series += [{"month": f"2025-{m:02d}", "total": 100000.0, "count": 200} for m in range(7, 13)]
    changes = analyze_committee_changes("C001", series)
    assert len(changes) >= 1
    assert any(c["direction"] == "increase" for c in changes)
