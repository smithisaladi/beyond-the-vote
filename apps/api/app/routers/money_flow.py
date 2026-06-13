"""Follow-the-money endpoint — trace PAC chain flows."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.deps import get_db

router = APIRouter(prefix="/api/money-flow", tags=["money-flow"])

@router.get("/{entity_id}")
async def follow_the_money(
    entity_id: str,
    direction: str = Query(default="inbound"),
    depth: int = Query(default=3, ge=1, le=5),
    db: AsyncSession = Depends(get_db),
):
    if direction not in ("inbound", "outbound"):
        raise HTTPException(status_code=400, detail="direction must be inbound or outbound")

    if direction == "inbound":
        sql = """
        SELECT mfa.origin_entity_id, mfa.origin_entity_type, mfa.attributed_amount,
               mfa.hop_count, mfa.path, mfa.cycle, cn.cmte_name AS origin_name
        FROM analytics.money_flow_attribution mfa
        LEFT JOIN fec.cmte_names cn ON cn.cmte_id = mfa.origin_entity_id
        WHERE mfa.destination_committee_id = :entity_id AND mfa.hop_count <= :depth
        ORDER BY mfa.attributed_amount DESC LIMIT 50
        """
    else:
        sql = """
        SELECT mfa.destination_committee_id, mfa.origin_entity_type, mfa.attributed_amount,
               mfa.hop_count, mfa.path, mfa.cycle, cn.cmte_name AS dest_name
        FROM analytics.money_flow_attribution mfa
        LEFT JOIN fec.cmte_names cn ON cn.cmte_id = mfa.destination_committee_id
        WHERE mfa.origin_entity_id = :entity_id AND mfa.hop_count <= :depth
        ORDER BY mfa.attributed_amount DESC LIMIT 50
        """

    result = await db.execute(text(sql), {"entity_id": entity_id, "depth": depth})
    rows = result.mappings().all()

    entity_name_result = await db.execute(
        text("SELECT cmte_name FROM fec.cmte_names WHERE cmte_id = :id"), {"id": entity_id})
    entity_name_row = entity_name_result.mappings().first()

    if not rows:
        if not entity_name_row:
            raise HTTPException(status_code=404, detail="Entity not found")
        return {"entityId": entity_id, "entityName": entity_name_row["cmte_name"],
                "direction": direction, "flows": [], "message": "No money flow data available"}

    nodes = {entity_id: {"id": entity_id, "name": entity_name_row["cmte_name"] if entity_name_row else entity_id, "type": "target"}}
    edges = []

    for r in rows:
        if direction == "inbound":
            origin_id = r["origin_entity_id"]
            nodes[origin_id] = {"id": origin_id, "name": r.get("origin_name") or origin_id, "type": r.get("origin_entity_type", "pac")}
            edges.append({"from": origin_id, "to": entity_id, "amount": float(r["attributed_amount"]),
                          "hopCount": r["hop_count"], "path": r.get("path") or []})
        else:
            dest_id = r["destination_committee_id"]
            nodes[dest_id] = {"id": dest_id, "name": r.get("dest_name") or dest_id, "type": "pac"}
            edges.append({"from": entity_id, "to": dest_id, "amount": float(r["attributed_amount"]),
                          "hopCount": r["hop_count"], "path": r.get("path") or []})

    for edge in edges:
        for node_id in edge.get("path", []):
            if node_id not in nodes:
                nodes[node_id] = {"id": node_id, "name": node_id, "type": "intermediate"}

    total_flow = sum(e["amount"] for e in edges)

    return {
        "entityId": entity_id, "entityName": nodes[entity_id]["name"],
        "direction": direction, "totalFlow": round(total_flow, 2),
        "nodes": list(nodes.values()), "edges": edges,
    }
