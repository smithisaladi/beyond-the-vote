"""Insert helpers for integration tests. Each commits so endpoints that open
their own sessions (politician_detail) can read the data."""
from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _date(value):
    """asyncpg binds DATE columns by inferred PG type and rejects plain strings,
    so normalize ISO strings to datetime.date (passes through None / date)."""
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(value)


async def add_legislator(db: AsyncSession, *, bioguide_id="L000001", full_name="Jane Doe",
                         party="Democrat", state="CA", state_full="California", chamber="house",
                         title="Representative", district=12, fec_ids=None, photo_url=None):
    await db.execute(text("""
        INSERT INTO congress.legislators
          (bioguide_id, first_name, last_name, full_name, party, chamber, state,
           state_full, district, title, fec_ids, photo_url, term_start)
        VALUES (:bid, :fn, :ln, :name, :party, :chamber, :state, :sf, :dist, :title,
                :fec, :photo, '2023-01-03')
    """), {"bid": bioguide_id, "fn": full_name.split()[0], "ln": full_name.split()[-1],
           "name": full_name, "party": party, "chamber": chamber, "state": state,
           "sf": state_full, "dist": district, "title": title, "fec": fec_ids, "photo": photo_url})
    await db.commit()
    return bioguide_id


async def add_bill(db: AsyncSession, *, bill_id, title, summary=None, status="Active",
                   topics=None, congress=118, bill_type="hr", bill_number=None,
                   policy_area=None, sponsor_bioguide_id=None, sponsor_name=None,
                   sponsor_party=None, introduced_date="2023-03-01",
                   last_action_text="Referred to committee", last_action_date="2023-03-02"):
    await db.execute(text("""
        INSERT INTO congress.bills
          (bill_id, congress, bill_type, bill_number, title, summary, status, policy_area,
           topics, sponsor_bioguide_id, sponsor_name, sponsor_party, introduced_date,
           last_action_text, last_action_date)
        VALUES (:id, :congress, :bt, :num, :title, :summary, :status, :pa,
                :topics, :sbid, :sname, :sparty, :intro, :lat, :lad)
    """), {"id": bill_id, "congress": congress, "bt": bill_type, "num": bill_number,
           "title": title, "summary": summary, "status": status, "pa": policy_area,
           "topics": topics or [], "sbid": sponsor_bioguide_id, "sname": sponsor_name,
           "sparty": sponsor_party, "intro": _date(introduced_date), "lat": last_action_text,
           "lad": _date(last_action_date)})
    await db.commit()
    return bill_id


async def add_embedding(db: AsyncSession, *, bill_id, vector, model_version="all-MiniLM-L6-v2",
                        has_summary=True):
    await db.execute(text("""
        INSERT INTO enrichment.bill_embeddings (bill_id, embedding, model_version, has_summary)
        VALUES (:id, :vec, :mv, :hs)
    """), {"id": bill_id, "vec": str(vector), "mv": model_version, "hs": has_summary})
    await db.commit()


async def add_vote(db: AsyncSession, *, vote_id, bill_id, chamber="House", date="2023-04-01",
                   question="On Passage", result="Passed", congress=118,
                   yea_total=220, nay_total=210):
    await db.execute(text("""
        INSERT INTO congress.bill_vote_summaries
          (id, bill_id, congress, chamber, date, question, result, yea_total, nay_total)
        VALUES (:id, :bid, :c, :ch, :d, :q, :r, :yea, :nay)
    """), {"id": vote_id, "bid": bill_id, "c": congress, "ch": chamber, "d": _date(date),
           "q": question, "r": result, "yea": yea_total, "nay": nay_total})
    await db.commit()
    return vote_id


async def add_vote_position(db: AsyncSession, *, vote_id, bioguide_id, position="Yea"):
    await db.execute(text("""
        INSERT INTO congress.bill_vote_positions (vote_id, bioguide_id, position)
        VALUES (:v, :b, :p)
    """), {"v": vote_id, "b": bioguide_id, "p": position})
    await db.commit()


async def add_action(db: AsyncSession, *, bill_id, acted_at="2023-04-01", text_="Passed House",
                     action_type="floor"):
    await db.execute(text("""
        INSERT INTO congress.bill_actions (bill_id, acted_at, text, action_type)
        VALUES (:b, :at, :t, :ty)
    """), {"b": bill_id, "at": acted_at, "t": text_, "ty": action_type})
    await db.commit()


async def add_committee_name(db: AsyncSession, *, cmte_id, name, connected_org=None):
    await db.execute(text("""
        INSERT INTO fec.cmte_names (cmte_id, cmte_name, connected_org)
        VALUES (:id, :name, :org)
    """), {"id": cmte_id, "name": name, "org": connected_org})
    await db.commit()


async def add_money_flow(db: AsyncSession, *, destination_committee_id, origin_entity_id,
                         origin_entity_type="pac", attributed_amount=50000, hop_count=1,
                         path=None, cycle=2024, model_version="v1"):
    await db.execute(text("""
        INSERT INTO analytics.money_flow_attribution
          (destination_committee_id, origin_entity_id, origin_entity_type,
           attributed_amount, hop_count, path, cycle, model_version)
        VALUES (:dest, :orig, :ot, :amt, :hop, :path, :cycle, :mv)
    """), {"dest": destination_committee_id, "orig": origin_entity_id, "ot": origin_entity_type,
           "amt": attributed_amount, "hop": hop_count, "path": path, "cycle": cycle, "mv": model_version})
    await db.commit()


async def add_funding_summary(db: AsyncSession, *, bioguide_id, cycle=2024, pac_direct_total=100000,
                              large_donor_total=50000, small_donor_total=25000,
                              superpac_ie_for=200000, superpac_ie_against=10000,
                              in_state_total=40000, out_of_state_total=35000):
    await db.execute(text("""
        INSERT INTO derived.legislator_funding_summary
          (bioguide_id, cycle, pac_direct_total, large_donor_total, small_donor_total,
           superpac_ie_for, superpac_ie_against, in_state_total, out_of_state_total)
        VALUES (:b, :c, :pac, :lg, :sm, :ief, :iea, :ist, :ost)
    """), {"b": bioguide_id, "c": cycle, "pac": pac_direct_total, "lg": large_donor_total,
           "sm": small_donor_total, "ief": superpac_ie_for, "iea": superpac_ie_against,
           "ist": in_state_total, "ost": out_of_state_total})
    await db.commit()
