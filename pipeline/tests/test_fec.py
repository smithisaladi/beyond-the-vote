from load.fec import transform_pac_contribution, transform_ie_contribution

def test_transform_pac_contribution_valid():
    record = {"sub_id": "4123456789", "cmte_id": "C00123456", "cand_id": "H0NY01234", "transaction_tp": "24K", "transaction_amt": "5000", "transaction_dt": "01152025"}
    row = transform_pac_contribution(record, cycle=2026)
    assert row is not None
    assert row["sub_id"] == 4123456789
    assert row["cmte_id"] == "C00123456"
    assert row["transaction_amt"] == 5000.0
    assert row["cycle"] == 2026

def test_transform_pac_contribution_wrong_type_returns_none():
    record = {"sub_id": "123", "cmte_id": "C00123456", "cand_id": "H0NY01234", "transaction_tp": "15", "transaction_amt": "5000"}
    assert transform_pac_contribution(record, cycle=2026) is None

def test_transform_pac_contribution_missing_sub_id_returns_none():
    record = {"sub_id": "", "cmte_id": "C00123456", "transaction_tp": "24K", "transaction_amt": "5000"}
    assert transform_pac_contribution(record, cycle=2026) is None

def test_transform_ie_contribution_support():
    record = {"sub_id": "9876543210", "cmte_id": "C00654321", "cand_id": "S0CA00001", "transaction_tp": "24E", "transaction_amt": "25000", "transaction_dt": "03012025", "sup_opp": "S"}
    row = transform_ie_contribution(record, cycle=2026)
    assert row is not None
    assert row["sup_opp"] == "S"
    assert row["transaction_amt"] == 25000.0
