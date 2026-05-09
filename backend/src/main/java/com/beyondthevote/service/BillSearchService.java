package com.beyondthevote.service;

import com.beyondthevote.dto.response.BillSearchResponse.BillSearchResultDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Hybrid FTS + trigram search with Reciprocal Rank Fusion.
 * Ports the logic from lib/queries/hybrid-bill-search.ts using raw SQL
 * via JdbcTemplate for full PostgreSQL feature support (tsvector, trigram).
 */
@Service
public class BillSearchService {

    private final JdbcTemplate jdbcTemplate;

    public BillSearchService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Execute hybrid search combining full-text search (FTS) ranking with
     * trigram similarity ranking, fused via Reciprocal Rank Fusion (RRF).
     */
    public List<BillSearchResultDto> hybridSearch(
            String queryText,
            int resultLimit,
            int offsetCount,
            String statusFilter,
            List<String> topicFilters,
            List<String> policyAreas,
            Integer congressFilter,
            List<String> billIds
    ) {
        StringBuilder sql = new StringBuilder();
        List<Object> params = new ArrayList<>();

        // Parameter index tracker
        sql.append("""
                WITH tsq AS (
                  SELECT websearch_to_tsquery('english', ?) AS q
                ),
                fts AS (
                  SELECT b.bill_id,
                         ROW_NUMBER() OVER (
                           ORDER BY ts_rank_cd(b.search_vector, (SELECT q FROM tsq)) DESC
                         ) AS rank
                  FROM bills b
                  WHERE b.search_vector @@ (SELECT q FROM tsq)
                """);
        params.add(queryText);

        appendFilters(sql, params, statusFilter, topicFilters, policyAreas, congressFilter, billIds);

        sql.append("""
                  LIMIT 40
                ),
                trgm AS (
                  SELECT b.bill_id,
                         ROW_NUMBER() OVER (
                           ORDER BY similarity(b.title, ?) DESC
                         ) AS rank
                  FROM bills b
                  WHERE similarity(b.title, ?) > 0.1
                """);
        params.add(queryText);
        params.add(queryText);

        appendFilters(sql, params, statusFilter, topicFilters, policyAreas, congressFilter, billIds);

        sql.append("""
                  LIMIT 20
                ),
                fused AS (
                  SELECT
                    COALESCE(f.bill_id, t.bill_id) AS bill_id,
                    (1.0 / (60.0 + COALESCE(f.rank, 999)::float))
                    + (0.5 / (60.0 + COALESCE(t.rank, 999)::float)) AS rrf_score
                  FROM fts f
                  FULL OUTER JOIN trgm t USING (bill_id)
                )
                SELECT
                  b.bill_id,
                  b.congress,
                  b.title,
                  b.bill_number,
                  b.status,
                  LEFT(b.summary, 400) AS summary,
                  b.sponsor_name,
                  b.sponsor_bioguide_id,
                  b.sponsor_party,
                  b.introduced_date::text AS introduced_date,
                  b.policy_area,
                  b.congress_gov_url,
                  b.last_action_text,
                  b.last_action_date::text AS last_action_date,
                  b.topics,
                  fu.rrf_score
                FROM fused fu
                JOIN bills b ON b.bill_id = fu.bill_id
                ORDER BY fu.rrf_score DESC
                LIMIT ? OFFSET ?
                """);
        params.add(resultLimit);
        params.add(offsetCount);

        return jdbcTemplate.query(sql.toString(), params.toArray(), SEARCH_RESULT_ROW_MAPPER);
    }

    private void appendFilters(
            StringBuilder sql,
            List<Object> params,
            String statusFilter,
            List<String> topicFilters,
            List<String> policyAreas,
            Integer congressFilter,
            List<String> billIds
    ) {
        if (statusFilter != null && !statusFilter.isBlank()) {
            sql.append("    AND b.status = ?\n");
            params.add(statusFilter);
        }
        if (topicFilters != null && !topicFilters.isEmpty()) {
            sql.append("    AND b.topics && ?::text[]\n");
            params.add(toPostgresArrayLiteral(topicFilters));
        }
        if (policyAreas != null && !policyAreas.isEmpty()) {
            sql.append("    AND b.policy_area = ANY(?::text[])\n");
            params.add(toPostgresArrayLiteral(policyAreas));
        }
        if (congressFilter != null) {
            sql.append("    AND b.congress = ?\n");
            params.add(congressFilter);
        }
        if (billIds != null && !billIds.isEmpty()) {
            sql.append("    AND b.bill_id = ANY(?::text[])\n");
            params.add(toPostgresArrayLiteral(billIds));
        }
    }

    /**
     * Convert a Java list to a PostgreSQL array literal string: {val1,val2,...}
     */
    private String toPostgresArrayLiteral(List<String> values) {
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) sb.append(",");
            // Escape quotes in values
            sb.append("\"").append(values.get(i).replace("\"", "\\\"")).append("\"");
        }
        sb.append("}");
        return sb.toString();
    }

    private static final RowMapper<BillSearchResultDto> SEARCH_RESULT_ROW_MAPPER = (rs, rowNum) -> {
        List<String> topics = extractStringArray(rs, "topics");
        return new BillSearchResultDto(
                rs.getString("bill_id"),
                rs.getInt("congress"),
                rs.getString("title"),
                rs.getString("bill_number"),
                rs.getString("status"),
                rs.getString("summary"),
                rs.getString("sponsor_name"),
                rs.getString("sponsor_bioguide_id"),
                rs.getString("sponsor_party"),
                rs.getString("introduced_date"),
                rs.getString("policy_area"),
                rs.getString("congress_gov_url"),
                rs.getString("last_action_text"),
                rs.getString("last_action_date"),
                topics,
                rs.getDouble("rrf_score")
        );
    };

    private static List<String> extractStringArray(ResultSet rs, String column) throws SQLException {
        Array arr = rs.getArray(column);
        if (arr == null) return Collections.emptyList();
        String[] values = (String[]) arr.getArray();
        return values == null ? Collections.emptyList() : Arrays.asList(values);
    }
}
