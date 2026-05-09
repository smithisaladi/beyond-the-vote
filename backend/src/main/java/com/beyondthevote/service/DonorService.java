package com.beyondthevote.service;

import com.beyondthevote.dto.response.DonorDetailResponse;
import com.beyondthevote.dto.response.DonorListResponse;
import com.beyondthevote.entity.ContributorLeaderboardCache;
import com.beyondthevote.exception.ResourceNotFoundException;
import com.beyondthevote.repository.ContributorLeaderboardCacheRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Service
public class DonorService {

    private static final Logger log = LoggerFactory.getLogger(DonorService.class);

    private final ContributorLeaderboardCacheRepository leaderboardRepository;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final AnthropicService anthropicService;

    public DonorService(
            ContributorLeaderboardCacheRepository leaderboardRepository,
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            AnthropicService anthropicService
    ) {
        this.leaderboardRepository = leaderboardRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.anthropicService = anthropicService;
    }

    public DonorListResponse listDonors(String query, int limit, int offset) {
        PageRequest pageable = PageRequest.of(offset / limit, limit);

        Page<ContributorLeaderboardCache> page;
        if (query != null && !query.isBlank()) {
            page = leaderboardRepository.searchByName(query.trim(), pageable);
        } else {
            page = leaderboardRepository.findAllByOrderByTotalContributionsDesc(pageable);
        }

        List<DonorListResponse.ContributorDto> contributors = new java.util.ArrayList<>();
        List<ContributorLeaderboardCache> rows = page.getContent();

        // Compute global ranks
        for (int i = 0; i < rows.size(); i++) {
            ContributorLeaderboardCache row = rows.get(i);
            long rank;
            if (query != null && !query.isBlank()) {
                // When searching, compute rank by counting how many total entries have higher contributions
                Long higherCount = leaderboardRepository.countByTotalContributionsGreaterThan(row.getTotalContributions());
                rank = (higherCount != null ? higherCount : 0) + 1;
            } else {
                rank = (long) offset + i + 1;
            }

            List<DonorListResponse.TopRecipientDto> topRecipients = parseTopRecipients(row.getTopRecipients());

            contributors.add(new DonorListResponse.ContributorDto(
                    row.getCmteId(),
                    rank,
                    row.getCmteName(),
                    row.getDirectTotal(),
                    row.getIeForTotal(),
                    row.getIeAgainstTotal(),
                    row.getTotalContributions(),
                    row.getRecipientCount(),
                    topRecipients
            ));
        }

        return new DonorListResponse(
                contributors,
                new DonorListResponse.PaginationDto(page.getTotalElements(), limit, offset)
        );
    }

    public DonorDetailResponse getPacDetail(String cmteId, boolean includeSummary) {
        String sql = """
                WITH cmte_info AS (
                    SELECT
                        MAX(cn.cmte_name)     AS cmte_name,
                        MAX(cn.connected_org) AS connected_org
                    FROM fec_cmte_names cn
                    WHERE cn.cmte_id = ?
                ),
                direct AS (
                    SELECT
                        p.cand_id,
                        SUM(p.transaction_amt) AS direct_amt
                    FROM pac_to_candidate p
                    WHERE p.cmte_id = ?
                    GROUP BY p.cand_id
                ),
                ies AS (
                    SELECT
                        ie.cand_id,
                        SUM(CASE WHEN ie.sup_opp = 'S' THEN ie.transaction_amt ELSE 0 END) AS ie_for,
                        SUM(CASE WHEN ie.sup_opp = 'O' THEN ie.transaction_amt ELSE 0 END) AS ie_against
                    FROM independent_expenditures ie
                    WHERE ie.cmte_id = ?
                    GROUP BY ie.cand_id
                ),
                per_candidate AS (
                    SELECT
                        COALESCE(d.cand_id, i.cand_id) AS cand_id,
                        COALESCE(d.direct_amt, 0)       AS direct_amt,
                        COALESCE(i.ie_for, 0)           AS ie_for,
                        COALESCE(i.ie_against, 0)       AS ie_against,
                        COALESCE(d.direct_amt, 0) + COALESCE(i.ie_for, 0) AS total_support
                    FROM direct d
                    FULL OUTER JOIN ies i ON d.cand_id = i.cand_id
                ),
                totals AS (
                    SELECT
                        COALESCE(SUM(direct_amt), 0)                                       AS direct_total,
                        COALESCE(SUM(ie_for), 0)                                           AS ie_for_total,
                        COALESCE(SUM(ie_against), 0)                                       AS ie_against_total,
                        COALESCE(SUM(total_support), 0)                                    AS total_contributions,
                        COUNT(DISTINCT cand_id) FILTER (WHERE total_support > 0)           AS recipient_count
                    FROM per_candidate
                )
                SELECT
                    ci.cmte_name,
                    ci.connected_org,
                    t.total_contributions,
                    t.direct_total,
                    t.ie_for_total,
                    t.ie_against_total,
                    t.recipient_count,
                    COALESCE(
                        (
                            SELECT jsonb_agg(r ORDER BY (r->>'amount')::numeric DESC)
                            FROM (
                                SELECT jsonb_build_object(
                                    'bioguide_id', l.bioguide_id,
                                    'name',        l.full_name,
                                    'party',       l.party,
                                    'state',       l.state,
                                    'chamber',     l.chamber,
                                    'amount',      pc.total_support,
                                    'direct',      pc.direct_amt,
                                    'ie_for',      pc.ie_for
                                ) AS r
                                FROM per_candidate pc
                                JOIN legislators l
                                    ON pc.cand_id = ANY(l.fec_ids)
                                WHERE pc.total_support > 0
                                ORDER BY pc.total_support DESC
                                LIMIT 20
                            ) sub
                        ),
                        '[]'::jsonb
                    ) AS recipients
                FROM totals t
                CROSS JOIN cmte_info ci
                """;

        List<Map<String, Object>> results = jdbcTemplate.queryForList(sql, cmteId, cmteId, cmteId);

        if (results.isEmpty()) {
            throw new ResourceNotFoundException("PAC not found");
        }

        Map<String, Object> row = results.get(0);

        String cmteName = row.get("cmte_name") != null ? row.get("cmte_name").toString() : "";
        String connectedOrg = row.get("connected_org") != null ? row.get("connected_org").toString() : null;
        BigDecimal totalContributions = toBigDecimal(row.get("total_contributions"));
        BigDecimal directTotal = toBigDecimal(row.get("direct_total"));
        BigDecimal ieForTotal = toBigDecimal(row.get("ie_for_total"));
        BigDecimal ieAgainstTotal = toBigDecimal(row.get("ie_against_total"));
        long recipientCount = toLong(row.get("recipient_count"));

        List<DonorDetailResponse.RecipientDto> recipients = parseRecipients(row.get("recipients"));

        // Check if the PAC actually exists (cmte_name is null means no committee found)
        if (cmteName.isEmpty() && totalContributions.signum() == 0) {
            throw new ResourceNotFoundException("PAC not found");
        }

        String summary = "";
        if (includeSummary) {
            summary = anthropicService.generatePacSummary(
                    cmteId,
                    cmteName,
                    connectedOrg,
                    totalContributions,
                    directTotal,
                    ieForTotal,
                    ieAgainstTotal,
                    recipientCount,
                    recipients
            );
        }

        return new DonorDetailResponse(
                cmteId,
                cmteName,
                connectedOrg,
                totalContributions,
                directTotal,
                ieForTotal,
                ieAgainstTotal,
                recipientCount,
                recipients,
                summary
        );
    }

    private List<DonorListResponse.TopRecipientDto> parseTopRecipients(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyList();
        }
        try {
            List<Map<String, Object>> raw = objectMapper.readValue(json, new TypeReference<>() {});
            return raw.stream()
                    .map(m -> new DonorListResponse.TopRecipientDto(
                            getString(m, "bioguide_id"),
                            getString(m, "name"),
                            getString(m, "party"),
                            getString(m, "state"),
                            getString(m, "chamber"),
                            toBigDecimal(m.get("amount"))
                    ))
                    .toList();
        } catch (Exception e) {
            log.error("[DonorService] Failed to parse top_recipients JSON", e);
            return Collections.emptyList();
        }
    }

    private List<DonorDetailResponse.RecipientDto> parseRecipients(Object recipientsObj) {
        if (recipientsObj == null) {
            return Collections.emptyList();
        }
        try {
            String json = recipientsObj.toString();
            List<Map<String, Object>> raw = objectMapper.readValue(json, new TypeReference<>() {});
            return raw.stream()
                    .map(m -> new DonorDetailResponse.RecipientDto(
                            getString(m, "bioguide_id"),
                            getString(m, "name"),
                            getString(m, "party"),
                            getString(m, "state"),
                            getString(m, "chamber"),
                            toBigDecimal(m.get("amount")),
                            toBigDecimal(m.get("direct")),
                            toBigDecimal(m.get("ie_for"))
                    ))
                    .toList();
        } catch (Exception e) {
            log.error("[DonorService] Failed to parse recipients JSON", e);
            return Collections.emptyList();
        }
    }

    private static String getString(Map<String, Object> map, String key) {
        Object val = map.get(key);
        return val != null ? val.toString() : "";
    }

    private static BigDecimal toBigDecimal(Object val) {
        if (val == null) return BigDecimal.ZERO;
        if (val instanceof BigDecimal bd) return bd;
        if (val instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try {
            return new BigDecimal(val.toString());
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    private static long toLong(Object val) {
        if (val == null) return 0;
        if (val instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(val.toString());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
