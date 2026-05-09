package com.beyondthevote.controller;

import com.beyondthevote.dto.response.BillDetailResponse;
import com.beyondthevote.dto.response.BillListResponse;
import com.beyondthevote.dto.response.BillSearchResponse;
import com.beyondthevote.dto.response.BillsByTopicResponse;
import com.beyondthevote.dto.response.BillSearchResponse.BillSearchResultDto;
import com.beyondthevote.service.BillSearchService;
import com.beyondthevote.service.BillService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/api/bills")
public class BillController {

    private final BillService billService;
    private final BillSearchService billSearchService;

    public BillController(BillService billService, BillSearchService billSearchService) {
        this.billService = billService;
        this.billSearchService = billSearchService;
    }

    /**
     * GET /api/bills — Browse or search bills.
     * When `q` is present, delegates to BillSearchService for hybrid FTS + trigram RRF search.
     * Otherwise, uses BillService for filtered browsing.
     */
    @GetMapping
    public ResponseEntity<?> getBills(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String topics,
            @RequestParam(required = false) String date,
            @RequestParam(required = false, defaultValue = "newest") String sort,
            @RequestParam(required = false, defaultValue = "20") int limit,
            @RequestParam(required = false, defaultValue = "0") int offset,
            @RequestParam(required = false) String billIds
    ) {
        // Text search mode
        if (q != null && !q.isBlank()) {
            List<String> topicSlugs = (topics != null && !topics.isBlank())
                    ? Arrays.stream(topics.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList()
                    : null;
            List<String> billIdList = (billIds != null && !billIds.isBlank())
                    ? Arrays.stream(billIds.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList()
                    : null;

            List<BillSearchResultDto> results = billSearchService.hybridSearch(
                    q, limit, offset,
                    (status != null && !status.isBlank()) ? status : null,
                    topicSlugs,
                    null,  // policyAreas
                    null,  // congressFilter
                    billIdList
            );

            // Estimate total: if we got a full page, there may be more
            long estimatedTotal = results.size() + offset + (results.size() == limit ? 1 : 0);

            // Map search results to BillSummaryDto format for consistent response shape
            List<BillListResponse.BillSummaryDto> bills = results.stream().map(r ->
                    new BillListResponse.BillSummaryDto(
                            r.billId(),
                            r.billNumber() != null ? r.billNumber() : r.billId(),
                            r.title(),
                            r.sponsorName() != null ? r.sponsorName() : "Unknown",
                            normalizeParty(r.sponsorParty()),
                            r.status() != null ? r.status() : "Active",
                            r.topics() != null ? r.topics() : Collections.emptyList(),
                            r.lastActionDate() != null ? r.lastActionDate() : "",
                            0L,  // lastActionTimestamp — raw date string is sufficient for search
                            r.summary() != null ? r.summary() : ""
                    )
            ).toList();

            return ResponseEntity.ok(new BillListResponse(
                    bills,
                    new BillListResponse.PaginationDto(estimatedTotal, limit, offset)
            ));
        }

        // Browse mode
        BillListResponse response = billService.browseBills(status, topics, date, sort, limit, offset, billIds);
        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/bills/search — Quick search endpoint.
     * Tries exact bill ID/number lookup first, then falls back to hybrid search.
     */
    @GetMapping("/search")
    public ResponseEntity<BillSearchResponse> searchBills(
            @RequestParam String q,
            @RequestParam(required = false, defaultValue = "10") int limit,
            @RequestParam(required = false) Integer congress
    ) {
        BillSearchResponse response = billService.quickSearch(q, limit, congress);
        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/bills/by-topic — Bills filtered by topic slug.
     */
    @GetMapping("/by-topic")
    public ResponseEntity<BillsByTopicResponse> getBillsByTopic(
            @RequestParam String slug,
            @RequestParam(required = false, defaultValue = "20") int limit,
            @RequestParam(required = false) String status
    ) {
        BillsByTopicResponse response = billService.getBillsByTopic(slug, limit, status);
        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/bills/{id} — Single bill detail with votes and sponsor info.
     */
    @GetMapping("/{id}")
    public ResponseEntity<BillDetailResponse> getBillDetail(@PathVariable String id) {
        BillDetailResponse response = billService.getBillDetail(id);
        return ResponseEntity.ok(response);
    }

    private String normalizeParty(String party) {
        if (party == null) return "Unknown";
        String lower = party.toLowerCase().trim();
        if (lower.startsWith("democrat")) return "Democrat";
        if (lower.startsWith("republican")) return "Republican";
        if (lower.startsWith("independent") || lower.startsWith("libertarian") || lower.startsWith("green")) {
            return "Independent";
        }
        return party;
    }
}
