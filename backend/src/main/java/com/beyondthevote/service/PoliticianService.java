package com.beyondthevote.service;

import com.beyondthevote.dto.response.PoliticianDetailResponse;
import com.beyondthevote.dto.response.PoliticianDetailResponse.*;
import com.beyondthevote.dto.response.PoliticianSearchResponse;
import com.beyondthevote.dto.response.PoliticianSearchResponse.PoliticianSummary;
import com.beyondthevote.entity.*;
import com.beyondthevote.exception.ResourceNotFoundException;
import com.beyondthevote.repository.*;
import com.beyondthevote.service.CongressApiService.CongressMember;
import com.beyondthevote.service.CongressApiService.CongressTerm;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.Year;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.stream.Collectors;

@Service
public class PoliticianService {

    private static final Logger log = LoggerFactory.getLogger(PoliticianService.class);

    private static final Set<String> PAC_SKIP = Set.of(
            "ACTBLUE", "WINRED",
            "DEMOCRATIC SENATORIAL CAMPAIGN COMMITTEE", "DSCC",
            "DEMOCRATIC CONGRESSIONAL CAMPAIGN COMMITTEE", "DCCC",
            "NRSC", "NRCC",
            "NATIONAL REPUBLICAN SENATORIAL COMMITTEE",
            "NATIONAL REPUBLICAN CONGRESSIONAL COMMITTEE",
            "DEMOCRATIC NATIONAL COMMITTEE", "DNC",
            "REPUBLICAN NATIONAL COMMITTEE", "RNC",
            "SENATE MAJORITY PAC", "HOUSE MAJORITY PAC",
            "SENATE LEADERSHIP FUND", "CONGRESSIONAL LEADERSHIP FUND",
            "EMILY'S LIST", "END CITIZENS UNITED"
    );

    private static final DateTimeFormatter VOTE_DATE_FORMAT =
            DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US);

    private final LegislatorRepository legislatorRepository;
    private final MemberScoreRepository memberScoreRepository;
    private final CommitteeMembershipRepository committeeMembershipRepository;
    private final CommitteeRepository committeeRepository;
    private final BillVotePositionRepository billVotePositionRepository;
    private final BillVoteSummaryRepository billVoteSummaryRepository;
    private final BillRepository billRepository;
    private final LegislatorTopPacRepository topPacRepository;
    private final LegislatorTopContributorRepository topContributorRepository;
    private final LegislatorFundingSummaryRepository fundingSummaryRepository;
    private final CongressApiService congressApiService;

    public PoliticianService(
            LegislatorRepository legislatorRepository,
            MemberScoreRepository memberScoreRepository,
            CommitteeMembershipRepository committeeMembershipRepository,
            CommitteeRepository committeeRepository,
            BillVotePositionRepository billVotePositionRepository,
            BillVoteSummaryRepository billVoteSummaryRepository,
            BillRepository billRepository,
            LegislatorTopPacRepository topPacRepository,
            LegislatorTopContributorRepository topContributorRepository,
            LegislatorFundingSummaryRepository fundingSummaryRepository,
            CongressApiService congressApiService) {
        this.legislatorRepository = legislatorRepository;
        this.memberScoreRepository = memberScoreRepository;
        this.committeeMembershipRepository = committeeMembershipRepository;
        this.committeeRepository = committeeRepository;
        this.billVotePositionRepository = billVotePositionRepository;
        this.billVoteSummaryRepository = billVoteSummaryRepository;
        this.billRepository = billRepository;
        this.topPacRepository = topPacRepository;
        this.topContributorRepository = topContributorRepository;
        this.fundingSummaryRepository = fundingSummaryRepository;
        this.congressApiService = congressApiService;
    }

    /**
     * Full politician profile with tiered data assembly.
     * Tier 1: local DB queries (parallel).
     * Tier 2: external API + vote assembly (parallel).
     */
    public PoliticianDetailResponse getPoliticianDetail(String bioguideId) {
        // ── Tier 1: Local DB (fast, parallel) ───────────────────────────────────
        CompletableFuture<Optional<Legislator>> legislatorFuture =
                CompletableFuture.supplyAsync(() -> legislatorRepository.findById(bioguideId));

        CompletableFuture<Optional<MemberScore>> scoreFuture =
                CompletableFuture.supplyAsync(() ->
                        memberScoreRepository.findFirstByIdBioguideIdOrderByIdCongressDesc(bioguideId));

        CompletableFuture<List<CommitteeMembership>> committeesFuture =
                CompletableFuture.supplyAsync(() ->
                        committeeMembershipRepository.findByIdBioguideId(bioguideId));

        // Wait for tier 1
        CompletableFuture.allOf(legislatorFuture, scoreFuture, committeesFuture).join();

        Optional<Legislator> legislatorOpt = safeGet(legislatorFuture);
        Optional<MemberScore> scoreOpt = safeGet(scoreFuture);
        List<CommitteeMembership> committeeMemberships = safeGet(committeesFuture);

        Legislator legislator = legislatorOpt != null ? legislatorOpt.orElse(null) : null;
        Optional<MemberScore> score = scoreOpt != null ? scoreOpt : Optional.empty();
        if (committeeMemberships == null) committeeMemberships = Collections.emptyList();

        // If not in DB, try Congress.gov API fallback
        if (legislator == null) {
            return buildCongressFallbackResponse(bioguideId, score.orElse(null));
        }

        // ── Tier 2: External APIs + vote/donor assembly (parallel) ──────────────
        CompletableFuture<List<BillDto>> sponsoredFuture =
                CompletableFuture.supplyAsync(() -> congressApiService.fetchSponsoredBills(bioguideId));

        CompletableFuture<List<VoteDto>> votesFuture =
                CompletableFuture.supplyAsync(() -> fetchRecentVotes(bioguideId));

        CompletableFuture<List<DonorDto>> pacDonorsFuture =
                CompletableFuture.supplyAsync(() -> buildPacDonors(bioguideId));

        CompletableFuture<List<TopContributorDto>> topContribFuture =
                CompletableFuture.supplyAsync(() -> buildTopContributors(bioguideId));

        CompletableFuture<FundingBreakdownDto> fundingFuture =
                CompletableFuture.supplyAsync(() -> buildFundingBreakdown(bioguideId));

        CompletableFuture.allOf(sponsoredFuture, votesFuture, pacDonorsFuture, topContribFuture, fundingFuture).join();

        List<BillDto> bills = Objects.requireNonNullElse(safeGet(sponsoredFuture), Collections.emptyList());
        List<VoteDto> votes = Objects.requireNonNullElse(safeGet(votesFuture), Collections.emptyList());
        List<DonorDto> pacDonors = Objects.requireNonNullElse(safeGet(pacDonorsFuture), Collections.emptyList());
        List<TopContributorDto> topContributors = Objects.requireNonNullElse(safeGet(topContribFuture), Collections.emptyList());
        FundingBreakdownDto fundingBreakdown = safeGet(fundingFuture);

        // Build committees
        List<CommitteeDto> committees = buildCommittees(committeeMemberships);

        // Compute derived fields
        boolean isSenate = "senate".equalsIgnoreCase(legislator.getChamber());
        int yearsInOffice = computeYearsInOffice(legislator);
        Integer nextElectionYear = computeNextElection(legislator, isSenate);
        String since = computeSince(legislator);

        String fecUrl = buildFecUrl(legislator.getFecIds());

        Double ideologyScore = score.map(s -> s.getNominateDim1() != null ? s.getNominateDim1().doubleValue() : null).orElse(null);

        Map<String, String> sources = new LinkedHashMap<>();
        sources.put("profile", "ok");
        sources.put("ideology", score.isPresent() ? "ok" : "error");
        sources.put("votes", "ok");
        sources.put("committees", "ok");
        sources.put("legislation", "ok");
        sources.put("donors", "ok");

        PoliticianDetail detail = new PoliticianDetail(
                bioguideId,
                bioguideId,
                legislator.getFullName(),
                legislator.getTitle(),
                legislator.getParty(),
                legislator.getStateFull(),
                legislator.getState(),
                legislator.getDistrict() != null ? ordinal(legislator.getDistrict()) : null,
                since,
                legislator.getPhotoUrl(),
                null,
                legislator.getWebsite(),
                legislator.getAddress(),
                legislator.getPhone(),
                legislator.getTwitter(),
                fecUrl,
                new StatsDto(
                        yearsInOffice,
                        null,
                        ideologyScore,
                        getIdeologyLabel(ideologyScore),
                        0,
                        null
                ),
                nextElectionYear,
                votes,
                bills,
                Collections.emptyList(),
                pacDonors,
                topContributors,
                fundingBreakdown,
                committees,
                null,
                true,
                sources
        );

        return new PoliticianDetailResponse(detail);
    }

    /**
     * Search politicians by name.
     */
    public PoliticianSearchResponse searchPoliticians(String query) {
        if (query == null || query.isBlank()) {
            return new PoliticianSearchResponse(Collections.emptyList());
        }

        String trimmed = query.trim();
        List<Legislator> results = legislatorRepository.searchByName(trimmed);

        // Also search by last name for middle-initial handling
        String lastWord = trimmed.contains(" ") ? trimmed.substring(trimmed.lastIndexOf(' ') + 1) : trimmed;
        if (!lastWord.equals(trimmed)) {
            List<Legislator> byLastName = legislatorRepository.searchByName(lastWord);
            Set<String> seen = results.stream()
                    .map(Legislator::getBioguideId)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            for (Legislator l : byLastName) {
                if (seen.add(l.getBioguideId())) {
                    results.add(l);
                }
            }
        }

        // Limit to 10
        if (results.size() > 10) {
            results = results.subList(0, 10);
        }

        // Batch-fetch ideology scores
        List<String> bioguideIds = results.stream().map(Legislator::getBioguideId).toList();
        Map<String, Double> ideologyMap = new HashMap<>();
        for (String id : bioguideIds) {
            memberScoreRepository.findFirstByIdBioguideIdOrderByIdCongressDesc(id)
                    .ifPresent(s -> {
                        if (s.getNominateDim1() != null) {
                            ideologyMap.put(id, s.getNominateDim1().doubleValue());
                        }
                    });
        }

        List<PoliticianSummary> politicians = results.stream()
                .map(l -> {
                    boolean isSenate = "senate".equalsIgnoreCase(l.getChamber());
                    return new PoliticianSummary(
                            l.getBioguideId(),
                            l.getBioguideId(),
                            l.getFullName(),
                            isSenate ? "U.S. Senator" : "U.S. Representative",
                            l.getParty(),
                            l.getState(),
                            l.getDistrict() != null ? l.getDistrict() + "th District" : null,
                            l.getPhotoUrl(),
                            null,
                            null,
                            null,
                            ideologyMap.get(l.getBioguideId())
                    );
                })
                .toList();

        return new PoliticianSearchResponse(politicians);
    }

    // ── Private helpers ─────────────────────────────────────────────────────────

    private PoliticianDetailResponse buildCongressFallbackResponse(String bioguideId, MemberScore score) {
        CongressMember member = congressApiService.fetchMember(bioguideId);
        if (member == null) {
            throw new ResourceNotFoundException("Politician not found");
        }

        CongressTerm latestTerm = member.getLatestTerm();
        CongressTerm firstTerm = member.getFirstTerm();

        String party = "Independent";
        if (latestTerm != null && latestTerm.party != null) {
            party = GeocodioService.normalizeParty(latestTerm.party);
        } else if (member.partyHistory != null && !member.partyHistory.isEmpty()) {
            party = GeocodioService.normalizeParty(member.partyHistory.get(0).partyName);
        }

        boolean isSenate = latestTerm != null
                && latestTerm.chamber != null
                && latestTerm.chamber.toLowerCase().contains("senate");

        int yearsInOffice = firstTerm != null && firstTerm.startYear != null
                ? Year.now().getValue() - firstTerm.startYear : 0;

        Integer nextElectionYear = null;
        if (latestTerm != null && latestTerm.startYear != null) {
            int termLength = isSenate ? 6 : 2;
            int y = latestTerm.startYear + termLength;
            int now = Year.now().getValue();
            while (y <= now) y += termLength;
            nextElectionYear = y;
        }

        String since = firstTerm != null && firstTerm.startYear != null
                ? firstTerm.startYear.toString() : null;

        Double ideologyScore = score != null && score.getNominateDim1() != null
                ? score.getNominateDim1().doubleValue() : null;

        // Fetch sponsored bills even for fallback
        List<BillDto> bills = congressApiService.fetchSponsoredBills(bioguideId);

        Map<String, String> sources = new LinkedHashMap<>();
        sources.put("profile", "congress.gov-fallback");
        sources.put("ideology", "unavailable");
        sources.put("votes", "unavailable");
        sources.put("committees", "unavailable");
        sources.put("legislation", bills.isEmpty() ? "error" : "ok");
        sources.put("donors", "unavailable");

        PoliticianDetail detail = new PoliticianDetail(
                bioguideId,
                bioguideId,
                member.directOrderName != null ? member.directOrderName : "",
                latestTerm != null && latestTerm.memberType != null
                        ? latestTerm.memberType
                        : (isSenate ? "U.S. Senator" : "U.S. Representative"),
                party,
                latestTerm != null && latestTerm.stateName != null ? latestTerm.stateName : "",
                latestTerm != null && latestTerm.stateCode != null ? latestTerm.stateCode : "",
                latestTerm != null && latestTerm.district != null ? ordinal(latestTerm.district) : null,
                since,
                member.depiction != null ? member.depiction.imageUrl : null,
                member.depiction != null ? member.depiction.attribution : null,
                member.officialWebsiteUrl,
                member.addressInformation != null ? member.addressInformation.officeAddress : null,
                member.addressInformation != null ? member.addressInformation.phoneNumber : null,
                null,
                null,
                new StatsDto(yearsInOffice, null, ideologyScore, getIdeologyLabel(ideologyScore), 0, null),
                nextElectionYear,
                Collections.emptyList(),
                bills,
                Collections.emptyList(),
                Collections.emptyList(),
                Collections.emptyList(),
                null,
                Collections.emptyList(),
                null,
                true,
                sources
        );

        return new PoliticianDetailResponse(detail);
    }

    private List<VoteDto> fetchRecentVotes(String bioguideId) {
        List<BillVotePosition> positions = billVotePositionRepository.findByBioguideId(bioguideId);
        if (positions.isEmpty()) return Collections.emptyList();

        // Get all vote IDs and fetch summaries
        List<String> voteIds = positions.stream()
                .map(p -> p.getId().getVoteId())
                .distinct()
                .toList();

        List<BillVoteSummary> summaries = billVoteSummaryRepository.findAllById(voteIds);
        Map<String, BillVoteSummary> summaryMap = summaries.stream()
                .collect(Collectors.toMap(BillVoteSummary::getId, s -> s));

        // Collect bill IDs for title lookup
        Set<String> billIds = summaries.stream()
                .map(BillVoteSummary::getBillId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        Map<String, String> billTitleMap = new HashMap<>();
        if (!billIds.isEmpty()) {
            List<Bill> bills = billRepository.findByBillIdIn(new ArrayList<>(billIds));
            for (Bill bill : bills) {
                if (bill.getTitle() != null) {
                    billTitleMap.put(bill.getBillId(), bill.getTitle());
                }
            }
        }

        // Build vote DTOs, sorted by date descending
        return positions.stream()
                .map(p -> {
                    BillVoteSummary summary = summaryMap.get(p.getId().getVoteId());
                    if (summary == null) return null;

                    String billTitle = summary.getBillId() != null
                            ? billTitleMap.get(summary.getBillId()) : null;
                    String displayTitle = billTitle != null ? billTitle
                            : (summary.getTitle() != null ? summary.getTitle() : summary.getQuestion());

                    String dateStr = summary.getDate() != null
                            ? summary.getDate().format(VOTE_DATE_FORMAT) : "";

                    return new VoteDto(
                            summary.getId(),
                            displayTitle,
                            summary.getBillId(),
                            billTitle != null ? billTitle : "",
                            dateStr,
                            p.getPosition(),
                            summary.getQuestion(),
                            Collections.emptyList()
                    );
                })
                .filter(Objects::nonNull)
                .sorted((a, b) -> {
                    // Sort by date descending — parse back if needed, or just compare strings
                    return b.date().compareTo(a.date());
                })
                .limit(50)
                .toList();
    }

    private List<DonorDto> buildPacDonors(String bioguideId) {
        List<LegislatorTopPac> pacs = topPacRepository.findByBioguideId(bioguideId);

        // Merge across cycles by committee, sum total_support
        Map<String, PacMerged> merged = new LinkedHashMap<>();
        for (LegislatorTopPac pac : pacs) {
            String name = pac.getCmteName() != null ? pac.getCmteName().toUpperCase().trim() : "";
            if (name.isEmpty() || PAC_SKIP.contains(name)) continue;

            String key = pac.getId().getCmteId() != null ? pac.getId().getCmteId() : name;
            double support = pac.getTotalSupport() != null ? pac.getTotalSupport().doubleValue() : 0;

            merged.merge(key, new PacMerged(
                    pac.getCmteName() != null ? pac.getCmteName()
                            : (pac.getConnectedOrg() != null ? pac.getConnectedOrg() : pac.getId().getCmteId()),
                    support
            ), (existing, incoming) -> new PacMerged(existing.name, existing.total + incoming.total));
        }

        return merged.values().stream()
                .sorted((a, b) -> Double.compare(b.total, a.total))
                .limit(10)
                .map(d -> new DonorDto(0, d.name, formatDollar(d.total), "PAC"))
                .collect(Collectors.toList())
                .stream()
                .map(new java.util.function.Function<DonorDto, DonorDto>() {
                    int rank = 0;
                    @Override
                    public DonorDto apply(DonorDto d) {
                        return new DonorDto(++rank, d.name(), d.amount(), d.category());
                    }
                })
                .toList();
    }

    private List<TopContributorDto> buildTopContributors(String bioguideId) {
        List<LegislatorTopContributor> contributors = topContributorRepository.findByBioguideId(bioguideId);

        // Merge across cycles by org name, sum totals
        Map<String, ContribMerged> merged = new LinkedHashMap<>();
        for (LegislatorTopContributor c : contributors) {
            String orgName = c.getId().getOrgName() != null ? c.getId().getOrgName().trim() : "";
            if (orgName.isEmpty()) continue;

            double total = c.getGrandTotal() != null ? c.getGrandTotal().doubleValue() : 0;
            String cmteId = c.getCmteId();

            merged.merge(orgName, new ContribMerged(orgName, total, cmteId),
                    (existing, incoming) -> new ContribMerged(
                            existing.orgName,
                            existing.total + incoming.total,
                            existing.cmteId != null ? existing.cmteId : incoming.cmteId
                    ));
        }

        List<ContribMerged> sorted = merged.values().stream()
                .sorted((a, b) -> Double.compare(b.total, a.total))
                .limit(10)
                .toList();

        List<TopContributorDto> result = new ArrayList<>();
        for (int i = 0; i < sorted.size(); i++) {
            ContribMerged cm = sorted.get(i);
            result.add(new TopContributorDto(i + 1, cm.orgName, formatDollar(cm.total), cm.cmteId));
        }
        return result;
    }

    private FundingBreakdownDto buildFundingBreakdown(String bioguideId) {
        List<LegislatorFundingSummary> rows = fundingSummaryRepository.findByBioguideId(bioguideId);
        if (rows.isEmpty()) return null;

        int maxCycle = rows.get(0).getId().getCycle();
        int minCycle = rows.get(rows.size() - 1).getId().getCycle();

        double totalReceipts = sumField(rows, LegislatorFundingSummary::getTotalReceipts);
        double pac = sumField(rows, LegislatorFundingSummary::getPacDirectTotal);
        double individualLarge = sumField(rows, LegislatorFundingSummary::getLargeDonorTotal);
        double individualSmall = sumField(rows, LegislatorFundingSummary::getSmallDonorTotal);
        double partyContributions = sumField(rows, LegislatorFundingSummary::getPolPtyTotal);
        double selfFunded = sumField(rows, LegislatorFundingSummary::getSelfFundedTotal);
        double other = sumField(rows, LegislatorFundingSummary::getOtherTotal);
        double superPacFor = sumField(rows, LegislatorFundingSummary::getSuperpacIeFor);
        double superPacAgainst = sumField(rows, LegislatorFundingSummary::getSuperpacIeAgainst);

        double inStateTotal = sumField(rows, LegislatorFundingSummary::getInStateTotal);
        double outOfStateTotal = sumField(rows, LegislatorFundingSummary::getOutOfStateTotal)
                + sumField(rows, LegislatorFundingSummary::getDcDonorTotal);
        double geoTotal = inStateTotal + outOfStateTotal;

        return new FundingBreakdownDto(
                pac, pct(pac, totalReceipts),
                individualLarge, pct(individualLarge, totalReceipts),
                individualSmall, pct(individualSmall, totalReceipts),
                partyContributions, pct(partyContributions, totalReceipts),
                selfFunded, pct(selfFunded, totalReceipts),
                other, pct(other, totalReceipts),
                totalReceipts,
                superPacFor, superPacAgainst,
                inStateTotal, outOfStateTotal,
                geoTotal > 0 ? (inStateTotal / geoTotal) * 100 : 0,
                geoTotal > 0 ? (outOfStateTotal / geoTotal) * 100 : 0,
                maxCycle, minCycle
        );
    }

    private List<CommitteeDto> buildCommittees(List<CommitteeMembership> memberships) {
        if (memberships.isEmpty()) return Collections.emptyList();

        // Batch-fetch committee details
        List<String> committeeIds = memberships.stream()
                .map(m -> m.getId().getCommitteeId())
                .distinct()
                .toList();

        List<Committee> committees = committeeRepository.findAllById(committeeIds);
        Map<String, Committee> committeeMap = committees.stream()
                .collect(Collectors.toMap(Committee::getThomasId, c -> c));

        return memberships.stream()
                .map(m -> {
                    Committee c = committeeMap.get(m.getId().getCommitteeId());
                    return new CommitteeDto(
                            c != null ? c.getName() : "",
                            c != null ? c.getUrl() : null,
                            c != null ? c.getChamber() : null,
                            m.getTitle()
                    );
                })
                .toList();
    }

    private int computeYearsInOffice(Legislator legislator) {
        // Check raw_json for first term start
        Map<String, Object> rawJson = legislator.getRawJson();
        if (rawJson != null) {
            Object termsObj = rawJson.get("terms");
            if (termsObj instanceof List<?> terms && !terms.isEmpty()) {
                Object firstTerm = terms.get(0);
                if (firstTerm instanceof Map<?, ?> termMap) {
                    Object start = termMap.get("start");
                    if (start instanceof String startStr) {
                        try {
                            int startYear = LocalDate.parse(startStr).getYear();
                            return Year.now().getValue() - startYear;
                        } catch (Exception ignored) {}
                    }
                }
            }
        }

        if (legislator.getTermStart() != null) {
            return Year.now().getValue() - legislator.getTermStart().getYear();
        }
        return 0;
    }

    private Integer computeNextElection(Legislator legislator, boolean isSenate) {
        if (legislator.getNextElection() != null) {
            return legislator.getNextElection();
        }
        if (legislator.getTermEnd() != null) {
            return legislator.getTermEnd().getYear();
        }
        if (legislator.getTermStart() != null) {
            int termLength = isSenate ? 6 : 2;
            int y = legislator.getTermStart().getYear() + termLength;
            int now = Year.now().getValue();
            while (y <= now) y += termLength;
            return y;
        }
        return null;
    }

    private String computeSince(Legislator legislator) {
        Map<String, Object> rawJson = legislator.getRawJson();
        if (rawJson != null) {
            Object termsObj = rawJson.get("terms");
            if (termsObj instanceof List<?> terms && !terms.isEmpty()) {
                Object firstTerm = terms.get(0);
                if (firstTerm instanceof Map<?, ?> termMap) {
                    Object start = termMap.get("start");
                    if (start instanceof String startStr) {
                        try {
                            return String.valueOf(LocalDate.parse(startStr).getYear());
                        } catch (Exception ignored) {}
                    }
                }
            }
        }
        if (legislator.getTermStart() != null) {
            return String.valueOf(legislator.getTermStart().getYear());
        }
        return null;
    }

    private static String buildFecUrl(String[] fecIds) {
        if (fecIds != null && fecIds.length > 0) {
            return "https://www.fec.gov/data/candidate/" + fecIds[0] + "/";
        }
        return null;
    }

    private static String getIdeologyLabel(Double score) {
        if (score == null) return null;
        if (score < -0.6) return "Very Liberal";
        if (score < -0.3) return "Liberal";
        if (score < -0.1) return "Lean Liberal";
        if (score <= 0.1) return "Moderate";
        if (score <= 0.3) return "Lean Conservative";
        if (score <= 0.6) return "Conservative";
        return "Very Conservative";
    }

    private static String ordinal(int n) {
        if (n >= 11 && n <= 13) return n + "th";
        return switch (n % 10) {
            case 1 -> n + "st";
            case 2 -> n + "nd";
            case 3 -> n + "rd";
            default -> n + "th";
        };
    }

    private static String formatDollar(double amount) {
        return "$" + String.format("%,d", Math.round(amount));
    }

    private static double pct(double value, double total) {
        return total > 0 ? (value / total) * 100 : 0;
    }

    private static double sumField(List<LegislatorFundingSummary> rows,
                                    java.util.function.Function<LegislatorFundingSummary, BigDecimal> getter) {
        return rows.stream()
                .map(getter)
                .filter(Objects::nonNull)
                .mapToDouble(BigDecimal::doubleValue)
                .sum();
    }

    private static <T> T safeGet(CompletableFuture<T> future) {
        try {
            return future.join();
        } catch (CompletionException e) {
            log.warn("Async task failed: {}", e.getCause() != null ? e.getCause().getMessage() : e.getMessage());
            return null;
        }
    }

    private record PacMerged(String name, double total) {}
    private record ContribMerged(String orgName, double total, String cmteId) {}
}
