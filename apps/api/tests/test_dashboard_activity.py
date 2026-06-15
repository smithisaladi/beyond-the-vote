"""Tests for the dashboard activity feed query module + endpoints."""
from datetime import datetime, timezone

from app.queries.activity import classify_alert


def test_classify_alert_passage_vote():
    assert classify_alert(kind="vote", question="On Passage of the Bill") is True


def test_classify_alert_motion_vote():
    assert classify_alert(kind="vote", question="On Motion to Recommit") is True


def test_classify_alert_routine_vote():
    assert classify_alert(kind="vote", question="On the Quorum Call") is False


def test_classify_alert_enacted_action():
    assert classify_alert(kind="action", action_text="Became Public Law No. 118-5") is True


def test_classify_alert_passed_action_via_status():
    assert classify_alert(kind="action", action_text="", status="Passed") is True


def test_classify_alert_routine_action():
    assert classify_alert(kind="action", action_text="Referred to the Committee on Finance.") is False


def test_classify_alert_unknown_kind():
    assert classify_alert(kind="other") is False
