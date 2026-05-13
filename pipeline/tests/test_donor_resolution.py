from enrich.donor_resolution import (
    build_blocking_key,
    extract_donors_from_parquet,
    cluster_block,
)


def test_build_blocking_key():
    assert build_blocking_key("SMITH", "10001") == "smi_10001"
    assert build_blocking_key("O'Brien", "90210") == "o'b_90210"
    assert build_blocking_key("Li", "00000") == "li_00000"


def test_build_blocking_key_missing_fields():
    assert build_blocking_key("", "10001") is None
    assert build_blocking_key("Smith", "") is None
    assert build_blocking_key(None, None) is None


def test_extract_donors_from_parquet(tmp_path):
    import duckdb
    parquet_path = tmp_path / "test_indiv.parquet"
    conn = duckdb.connect(":memory:")
    conn.execute("""
        CREATE TABLE donors AS SELECT
            'C00123456' as cmte_id, '' as amndt_ind, '' as rpt_tp,
            '' as transaction_pgi, '' as image_num, '15' as transaction_tp,
            'IND' as entity_tp, 'SMITH, JOHN' as name,
            'NEW YORK' as city, 'NY' as state, '10001' as zip_code,
            'GOLDMAN SACHS' as employer, 'BANKER' as occupation,
            '01152025' as transaction_dt, '500' as transaction_amt,
            '' as other_id, '' as tran_id, '' as file_num,
            '' as memo_cd, '' as memo_text, '1001' as sub_id
    """)
    conn.execute(f"COPY donors TO '{parquet_path}' (FORMAT PARQUET)")
    conn.close()

    donors = extract_donors_from_parquet(parquet_path)
    assert len(donors) == 1
    assert donors[0]["name"] == "SMITH, JOHN"
    assert donors[0]["employer"] == "GOLDMAN SACHS"
    assert donors[0]["zip5"] == "10001"
    assert donors[0]["sub_id"] == 1001


def test_cluster_block_single_donor():
    donors = [
        {"sub_id": 1, "name": "SMITH, JOHN", "employer": "GOLDMAN SACHS",
         "city": "NEW YORK", "state": "NY", "zip5": "10001"},
    ]
    results = cluster_block(donors, model=None, threshold=0.15)
    # Returns dict[int, list[int]] — one cluster with one index
    assert len(results) == 1
    assert 0 in results
    assert results[0] == [0]


def test_cluster_block_identical_donors_same_cluster():
    donors = [
        {"sub_id": 1, "name": "SMITH, JOHN", "employer": "GOLDMAN SACHS",
         "city": "NEW YORK", "state": "NY", "zip5": "10001"},
        {"sub_id": 2, "name": "SMITH, JOHN", "employer": "GOLDMAN SACHS",
         "city": "NEW YORK", "state": "NY", "zip5": "10001"},
    ]
    results = cluster_block(donors, model=None, threshold=0.15)
    # Identical donors should be in one cluster with both indices
    assert len(results) == 1
    cluster_indices = list(results.values())[0]
    assert 0 in cluster_indices
    assert 1 in cluster_indices
