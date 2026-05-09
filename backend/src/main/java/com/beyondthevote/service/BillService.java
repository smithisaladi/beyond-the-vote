package com.beyondthevote.service;

import com.beyondthevote.dto.response.BillDetailResponse;
import com.beyondthevote.dto.response.BillDetailResponse.*;
import com.beyondthevote.dto.response.BillListResponse;
import com.beyondthevote.dto.response.BillListResponse.BillSummaryDto;
import com.beyondthevote.dto.response.BillListResponse.PaginationDto;
import com.beyondthevote.dto.response.BillSearchResponse;
import com.beyondthevote.dto.response.BillSearchResponse.BillSearchResultDto;
import com.beyondthevote.dto.response.BillsByTopicResponse;
import com.beyondthevote.dto.response.BillsByTopicResponse.BillTopicDto;
import com.beyondthevote.entity.Bill;
import com.beyondthevote.entity.BillVotePosition;
import com.beyondthevote.entity.BillVoteSummary;
import com.beyondthevote.entity.Legislator;
import com.beyondthevote.exception.ResourceNotFoundException;
import com.beyondthevote.repository.BillRepository;
import com.beyondthevote.repository.BillSpecification;
import com.beyondthevote.repository.BillVotePositionRepository;
import com.beyondthevote.repository.BillVoteSummaryRepository;
import com.beyondthevote.repository.LegislatorRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class BillService {

    private static final DateTimeFormatter DISPLAY_DATE_FORMAT =
            DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US);

    private final BillRepository billRepository;
    private final BillVoteSummaryRepository billVoteSummaryRepository;
    private final BillVotePositionRepository billVotePositionRepository;
    private final LegislatorRepository legislatorRepository;
    private final BillSearchService billSearchService;
    private final JdbcTemplate jdbcTemplate;

    public BillService(
            BillRepository billRepository,
            BillVoteSummaryRepository billVoteSummaryRepository,
            BillVotePositionRepository billVotePositionRepository,
            LegislatorRepository legislatorRepository,
            BillSearchService billSearchService,
            JdbcTemplate jdbcTemplate
    ) {
        this.billRepository = billRepository;
        this.billVoteSummaryRepository = billVoteSummaryRepository;
        this.billVotePositionRepository = billVotePositionRepository;
        this.legislatorRepository = legislatorRepository;
        this.billSearchService = billSearchService;
        this.jdbcTemplate = jdbcTemplate;
    }

    // ───────────────────────── Browse bills (GET /api/bills without q) ─────────────────────────

    public BillListResponse browseBills(
            String status,
            String topics,
            String dateFilter,
            String sort,
            int limit,
            int offset,
            String billIdsParam
    ) {
        List<String> topicSlugs = (topics != null && !topics.isBlank())
                ? Arrays.stream(topics.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList()
                : Collections.emptyList();
        List<String> billIds = (billIdsParam != null && !billIdsParam.isBlank())
                ? Arrays.stream(billIdsParam.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList()
                : Collections.emptyList();

        // Build native query for topics overlap (JPA Specification cannot express &&)
        if (!topicSlugs.isEmpty()) {
            return browseBillsNative(status, topicSlugs, dateFilter, sort, limit, offset, billIds);
        }

        // Use JPA Specification for non-topics filters
        Specification<Bill> spec = Specification.where(BillSpecification.withStatus(status))
                .and(BillSpecification.withDateRange(dateFilter))
                .and(BillSpecification.withBillIds(billIds));

        Sort jpaSort = "oldest".equalsIgnoreCase(sort)
                ? Sort.by(Sort.Direction.ASC, "introducedDate")
                : Sort.by(Sort.Direction.DESC, "introducedDate");

        // Spring Data Page is 0-based; our offset is row-based
        int pageNumber = offset / Math.max(limit, 1);
        Page<Bill> page = billRepository.findAll(spec, PageRequest.of(pageNumber, limit, jpaSort));

        List<Bill> enriched = enrichSponsors(page.getContent());

        return new BillListResponse(
                enriched.stream().map(this::toSummaryDto).toList(),
                new PaginationDto(page.getTotalElements(), limit, offset)
        );
    }

    /**
     * Native query path when topic overlap filtering is needed.
     */
    private BillListResponse browseBillsNative(
            String status,
            List<String> topicSlugs,
            String dateFilter,
            String sort,
            int limit,
            int offset,
            List<String> billIds
    ) {
        StringBuilder sql = new StringBuilder("SELECT * FROM bills WHERE 1=1");
        StringBuilder countSql = new StringBuilder("SELECT COUNT(*) FROM bills WHERE 1=1");
        List<Object> params = new ArrayList<>();
        List<Object> countParams = new ArrayList<>();

        // Topics overlap
        String topicArray = toPostgresArrayLiteral(topicSlugs);
        sql.append(" AND topics && ?::text[]");
        countSql.append(" AND topics && ?::text[]");
        params.add(topicArray);
        countParams.add(topicArray);

        // Status
        if (status != null && !status.isBlank()) {
            String[] statuses = status.split(",");
            if (statuses.length == 1) {
                sql.append(" AND status = ?");
                countSql.append(" AND status = ?");
                params.add(statuses[0].trim());
                countParams.add(statuses[0].trim());
            } else {
                String placeholders = String.join(",", Collections.nCopies(statuses.length, "?"));
                sql.append(" AND status IN (").append(placeholders).append(")");
                countSql.append(" AND status IN (").append(placeholders).append(")");
                for (String s : statuses) {
                    params.add(s.trim());
                    countParams.add(s.trim());
                }
            }
        }

        // Date filter
        if ("month".equalsIgnoreCase(dateFilter)) {
            sql.append(" AND last_action_date >= ?");
            countSql.append(" AND last_action_date >= ?");
            LocalDate cutoff = LocalDate.now().minusDays(30);
            params.add(cutoff);
            countParams.add(cutoff);
        } else if ("year".equalsIgnoreCase(dateFilter)) {
            sql.append(" AND last_action_date >= ?");
            countSql.append(" AND last_action_date >= ?");
            LocalDate cutoff = LocalDate.now().minusDays(365);
            params.add(cutoff);
            countParams.add(cutoff);
        }

        // Bill IDs
        if (billIds != null && !billIds.isEmpty()) {
            String placeholders = String.join(",", Collections.nCopies(billIds.size(), "?"));
            sql.append(" AND bill_id IN (").append(placeholders).append(")");
            countSql.append(" AND bill_id IN (").append(placeholders).append(")");
            params.addAll(billIds);
            countParams.addAll(billIds);
        }

        // Sort
        if ("oldest".equalsIgnoreCase(sort)) {
            sql.append(" ORDER BY introduced_date ASC NULLS LAST");
        } else {
            sql.append(" ORDER BY introduced_date DESC NULLS LAST");
        }

        sql.append(" LIMIT ? OFFSET ?");
        params.add(limit);
        params.add(offset);

        Long total = jdbcTemplate.queryForObject(countSql.toString(), Long.class, countParams.toArray());

        List<Bill> bills = jdbcTemplate.query(sql.toString(), params.toArray(), (rs, rowNum) -> {
            Bill b = new Bill();
            b.setBillId(rs.getString("bill_id"));
            b.setCongress(rs.getInt("congress"));
            b.setTitle(rs.getString("title"));
            b.setSummary(rs.getString("summary"));
            b.setBillNumber(rs.getString("bill_number"));
            b.setStatus(rs.getString("status"));
            b.setSponsorName(rs.getString("sponsor_name"));
            b.setSponsorBioguideId(rs.getString("sponsor_bioguide_id"));
            b.setSponsorParty(rs.getString("sponsor_party"));
            b.setPolicyArea(rs.getString("policy_area"));
            b.setLastActionText(rs.getString("last_action_text"));
            java.sql.Date introDate = rs.getDate("introduced_date");
            if (introDate != null) b.setIntroducedDate(introDate.toLocalDate());
            java.sql.Date lastDate = rs.getDate("last_action_date");
            if (lastDate != null) b.setLastActionDate(lastDate.toLocalDate());
            java.sql.Array topicsArr = rs.getArray("topics");
            if (topicsArr != null) {
                b.setTopics((String[]) topicsArr.getArray());
            } else {
                b.setTopics(new String[0]);
            }
            return b;
        });

        List<Bill> enriched = enrichSponsors(bills);

        return new BillListResponse(
                enriched.stream().map(this::toSummaryDto).toList(),
                new PaginationDto(total != null ? total : 0, limit, offset)
        );
    }

    // ───────────────────────── Bill detail (GET /api/bills/{id}) ─────────────────────────

    public BillDetailResponse getBillDetail(String id) {
        Bill bill = billRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bill not found: " + id));

        // Fetch vote summaries
        List<BillVoteSummary> voteSummaries = billVoteSummaryRepository.findByBillIdOrderByDateDesc(id);

        // For each vote summary, fetch positions with legislator info
        List<VoteDto> votes = voteSummaries.stream().map(v -> {
            List<BillVotePosition> positions = billVotePositionRepository.findByIdVoteId(v.getId());

            // Collect bioguide IDs to batch-load legislators
            List<String> bioguideIds = positions.stream()
                    .map(p -> p.getId().getBioguideId())
                    .distinct()
                    .toList();
            Map<String, Legislator> legMap = legislatorRepository.findAllById(bioguideIds)
                    .stream()
                    .collect(Collectors.toMap(Legislator::getBioguideId, l -> l));

            List<MemberPositionDto> memberPositions = positions.stream().map(p -> {
                Legislator leg = legMap.get(p.getId().getBioguideId());
                return new MemberPositionDto(
                        p.getId().getBioguideId(),
                        leg != null ? leg.getFullName() : "",
                        leg != null ? leg.getParty() : "",
                        leg != null ? leg.getState() : "",
                        leg != null ? leg.getPhotoUrl() : null,
                        p.getPosition()
                );
            }).toList();

            return new VoteDto(
                    v.getId(),
                    v.getDate() != null ? v.getDate().toString() : null,
                    v.getChamber(),
                    v.getTitle() != null ? v.getTitle() : v.getQuestion(),
                    v.getResult(),
                    v.getRequired(),
                    v.getYeaTotal(),
                    v.getNayTotal(),
                    v.getPresentTotal(),
                    v.getNotVotingTotal(),
                    new PartyBreakdownDto(
                            new PartyVoteDto(
                                    v.getYeaDemocrat() != null ? v.getYeaDemocrat() : 0,
                                    v.getNayDemocrat() != null ? v.getNayDemocrat() : 0
                            ),
                            new PartyVoteDto(
                                    v.getYeaRepublican() != null ? v.getYeaRepublican() : 0,
                                    v.getNayRepublican() != null ? v.getNayRepublican() : 0
                            ),
                            new PartyVoteDto(
                                    v.getYeaIndependent() != null ? v.getYeaIndependent() : 0,
                                    v.getNayIndependent() != null ? v.getNayIndependent() : 0
                            )
                    ),
                    memberPositions,
                    v.getSourceUrl()
            );
        }).toList();

        // Parse bill ID to extract congress/type/number for formatting
        String billNumber = bill.getBillNumber() != null ? bill.getBillNumber() : bill.getBillId();

        // Build sponsor DTO
        SponsorDto sponsor = null;
        if (bill.getSponsorBioguideId() != null) {
            Legislator sponsorLeg = legislatorRepository.findById(bill.getSponsorBioguideId()).orElse(null);
            sponsor = new SponsorDto(
                    bill.getSponsorName() != null ? bill.getSponsorName()
                            : (sponsorLeg != null ? sponsorLeg.getFullName() : "Unknown"),
                    bill.getSponsorBioguideId(),
                    bill.getSponsorParty() != null ? bill.getSponsorParty()
                            : (sponsorLeg != null ? sponsorLeg.getParty() : null),
                    sponsorLeg != null ? sponsorLeg.getState() : null,
                    sponsorLeg != null ? sponsorLeg.getDistrict() : null
            );
        }

        BillDetail detail = new BillDetail(
                bill.getBillId(),
                billNumber,
                bill.getTitle(),
                bill.getCongress(),
                bill.getIntroducedDate() != null ? bill.getIntroducedDate().toString() : null,
                bill.getStatus() != null ? bill.getStatus() : "Active",
                bill.getSummary() != null ? bill.getSummary() : "",
                sponsor,
                Collections.emptyList(),  // cosponsors not stored in local DB
                bill.getPolicyArea(),
                bill.getTopics() != null ? Arrays.asList(bill.getTopics()) : Collections.emptyList(),
                Collections.emptyList(),  // subjects not stored in local DB
                bill.getCongressGovUrl(),
                Collections.emptyList(),  // actions not stored in local DB
                votes,
                !voteSummaries.isEmpty()
        );

        return new BillDetailResponse(detail);
    }

    // ───────────────────────── Bills by topic (GET /api/bills/by-topic) ─────────────────────────

    public BillsByTopicResponse getBillsByTopic(String slug, int limit, String status) {
        // Use native query from BillRepository for array containment
        StringBuilder sql = new StringBuilder(
                "SELECT bill_id, congress, title, summary, bill_number, status, topics FROM bills WHERE topics @> ARRAY[?]::text[]"
        );
        List<Object> params = new ArrayList<>();
        params.add(slug);

        if (status != null && !status.isBlank()) {
            sql.append(" AND status = ?");
            params.add(status);
        }

        sql.append(" ORDER BY synced_at DESC NULLS LAST LIMIT ?");
        params.add(limit);

        List<BillTopicDto> bills = jdbcTemplate.query(sql.toString(), params.toArray(), (rs, rowNum) -> {
            java.sql.Array topicsArr = rs.getArray("topics");
            List<String> topics = Collections.emptyList();
            if (topicsArr != null) {
                String[] arr = (String[]) topicsArr.getArray();
                if (arr != null) topics = Arrays.asList(arr);
            }
            return new BillTopicDto(
                    rs.getString("bill_id"),
                    rs.getString("bill_number") != null ? rs.getString("bill_number") : rs.getString("bill_id"),
                    rs.getString("title"),
                    rs.getString("status") != null ? rs.getString("status") : "Active",
                    topics,
                    rs.getString("summary")
            );
        });

        return new BillsByTopicResponse(slug, bills, bills.size());
    }

    // ───────────────────────── Quick search (GET /api/bills/search) ─────────────────────────

    private static final String BILL_ID_PATTERN = "^\\d{3}-[a-z]+-\\d+$";
    private static final String BILL_NUMBER_PATTERN = "^[hs]\\.?\\s*(?:r(?:es)?|j\\.?res|con\\.?res)?\\.?\\s*\\d+$";

    public BillSearchResponse quickSearch(String q, int limit, Integer congress) {
        // Try exact lookup first if it looks like a bill ID or number
        if (q.matches(BILL_ID_PATTERN) || q.toLowerCase().matches(BILL_NUMBER_PATTERN)) {
            List<Bill> exact = lookupBill(q);
            if (!exact.isEmpty()) {
                List<BillSearchResultDto> results = exact.stream().map(this::toSearchResultDto).toList();
                return new BillSearchResponse(q, results, results.size());
            }
        }

        // Fall back to hybrid search
        List<BillSearchResultDto> results = billSearchService.hybridSearch(
                q, limit, 0, null, null, null, congress, null
        );

        return new BillSearchResponse(q, results, results.size());
    }

    private List<Bill> lookupBill(String queryText) {
        String trimmed = queryText.trim();
        return jdbcTemplate.query(
                "SELECT * FROM bills WHERE bill_id = ? OR UPPER(bill_number) = ? LIMIT 1",
                new Object[]{trimmed.toLowerCase(), trimmed.toUpperCase()},
                (rs, rowNum) -> {
                    Bill b = new Bill();
                    b.setBillId(rs.getString("bill_id"));
                    b.setCongress(rs.getInt("congress"));
                    b.setTitle(rs.getString("title"));
                    b.setSummary(rs.getString("summary"));
                    b.setBillNumber(rs.getString("bill_number"));
                    b.setStatus(rs.getString("status"));
                    b.setSponsorName(rs.getString("sponsor_name"));
                    b.setSponsorBioguideId(rs.getString("sponsor_bioguide_id"));
                    b.setSponsorParty(rs.getString("sponsor_party"));
                    b.setPolicyArea(rs.getString("policy_area"));
                    b.setCongressGovUrl(rs.getString("congress_gov_url"));
                    b.setLastActionText(rs.getString("last_action_text"));
                    java.sql.Date introDate = rs.getDate("introduced_date");
                    if (introDate != null) b.setIntroducedDate(introDate.toLocalDate());
                    java.sql.Date lastDate = rs.getDate("last_action_date");
                    if (lastDate != null) b.setLastActionDate(lastDate.toLocalDate());
                    java.sql.Array topicsArr = rs.getArray("topics");
                    if (topicsArr != null) {
                        b.setTopics((String[]) topicsArr.getArray());
                    } else {
                        b.setTopics(new String[0]);
                    }
                    return b;
                }
        );
    }

    // ───────────────────────── Mapping helpers ─────────────────────────

    private BillSummaryDto toSummaryDto(Bill bill) {
        String partyLabel = normalizeParty(bill.getSponsorParty());
        String lastAction = "";
        long lastActionTimestamp = 0;
        if (bill.getLastActionDate() != null) {
            lastAction = bill.getLastActionDate().format(DISPLAY_DATE_FORMAT);
            lastActionTimestamp = bill.getLastActionDate().atStartOfDay(ZoneOffset.UTC)
                    .toInstant().toEpochMilli();
        }

        return new BillSummaryDto(
                bill.getBillId(),
                bill.getBillNumber() != null ? bill.getBillNumber() : bill.getBillId(),
                bill.getTitle(),
                bill.getSponsorName() != null ? bill.getSponsorName() : "Unknown",
                partyLabel,
                bill.getStatus() != null ? bill.getStatus() : "Active",
                bill.getTopics() != null ? Arrays.asList(bill.getTopics()) : Collections.emptyList(),
                lastAction,
                lastActionTimestamp,
                bill.getSummary() != null ? bill.getSummary()
                        : (bill.getLastActionText() != null ? bill.getLastActionText() : "")
        );
    }

    private BillSearchResultDto toSearchResultDto(Bill bill) {
        return new BillSearchResultDto(
                bill.getBillId(),
                bill.getCongress(),
                bill.getTitle(),
                bill.getBillNumber(),
                bill.getStatus(),
                bill.getSummary(),
                bill.getSponsorName(),
                bill.getSponsorBioguideId(),
                bill.getSponsorParty(),
                bill.getIntroducedDate() != null ? bill.getIntroducedDate().toString() : null,
                bill.getPolicyArea(),
                bill.getCongressGovUrl(),
                bill.getLastActionText(),
                bill.getLastActionDate() != null ? bill.getLastActionDate().toString() : null,
                bill.getTopics() != null ? Arrays.asList(bill.getTopics()) : Collections.emptyList(),
                0.0  // no RRF score for exact lookups
        );
    }

    /**
     * Enrich bills that are missing sponsor info by looking up the legislator table.
     * Mirrors enrichBillsWithSponsors from the TS route.
     */
    private List<Bill> enrichSponsors(List<Bill> bills) {
        Set<String> missingIds = bills.stream()
                .filter(b -> b.getSponsorBioguideId() != null
                        && (b.getSponsorParty() == null || b.getSponsorName() == null))
                .map(Bill::getSponsorBioguideId)
                .collect(Collectors.toSet());

        if (missingIds.isEmpty()) return bills;

        Map<String, Legislator> legMap = legislatorRepository.findAllById(missingIds)
                .stream()
                .collect(Collectors.toMap(Legislator::getBioguideId, l -> l));

        return bills.stream().map(b -> {
            if (b.getSponsorBioguideId() != null && legMap.containsKey(b.getSponsorBioguideId())) {
                Legislator leg = legMap.get(b.getSponsorBioguideId());
                if (b.getSponsorParty() == null) b.setSponsorParty(leg.getParty());
                if (b.getSponsorName() == null) b.setSponsorName(leg.getFullName());
            }
            return b;
        }).toList();
    }

    /**
     * Normalize party string to canonical label matching the frontend's toParty().
     */
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

    private String toPostgresArrayLiteral(List<String> values) {
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(values.get(i).replace("\"", "\\\"")).append("\"");
        }
        sb.append("}");
        return sb.toString();
    }
}
