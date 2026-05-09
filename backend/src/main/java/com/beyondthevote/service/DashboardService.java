package com.beyondthevote.service;

import com.beyondthevote.entity.*;
import com.beyondthevote.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class DashboardService {

    private final FollowedPoliticianRepository followedRepo;
    private final TrackedBillRepository trackedRepo;
    private final TopicPreferenceRepository topicPrefRepo;
    private final LegislatorRepository legislatorRepo;
    private final BillRepository billRepo;
    private final BillVotePositionRepository votePositionRepo;
    private final BillVoteSummaryRepository voteSummaryRepo;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US);

    public DashboardService(FollowedPoliticianRepository followedRepo,
                            TrackedBillRepository trackedRepo,
                            TopicPreferenceRepository topicPrefRepo,
                            LegislatorRepository legislatorRepo,
                            BillRepository billRepo,
                            BillVotePositionRepository votePositionRepo,
                            BillVoteSummaryRepository voteSummaryRepo) {
        this.followedRepo = followedRepo;
        this.trackedRepo = trackedRepo;
        this.topicPrefRepo = topicPrefRepo;
        this.legislatorRepo = legislatorRepo;
        this.billRepo = billRepo;
        this.votePositionRepo = votePositionRepo;
        this.voteSummaryRepo = voteSummaryRepo;
    }

    public Map<String, Object> getFollowedPoliticians(UUID userId) {
        List<FollowedPolitician> follows = followedRepo.findByIdUserId(userId);
        if (follows.isEmpty()) {
            return Map.of("politicians", List.of());
        }

        List<String> ids = follows.stream()
                .map(f -> f.getId().getPoliticianId())
                .toList();

        List<Legislator> legislators = legislatorRepo.findAllById(ids);
        if (legislators.isEmpty()) {
            return Map.of("politicians", List.of());
        }

        // Fetch recent votes for all followed legislators
        Map<String, Map<String, Object>> latestVoteMap = new HashMap<>();
        for (String bioguideId : ids) {
            List<BillVotePosition> positions = votePositionRepo.findByBioguideId(bioguideId);
            if (positions.isEmpty()) continue;

            // Get vote summaries for these positions
            Set<String> voteIds = positions.stream()
                    .map(p -> p.getId().getVoteId())
                    .collect(Collectors.toSet());

            List<BillVoteSummary> summaries = voteSummaryRepo.findAllById(voteIds).stream()
                    .sorted(Comparator.comparing(BillVoteSummary::getDate, Comparator.nullsLast(Comparator.reverseOrder())))
                    .toList();

            if (summaries.isEmpty()) continue;
            BillVoteSummary latest = summaries.get(0);

            // Find position for this vote
            String position = positions.stream()
                    .filter(p -> p.getId().getVoteId().equals(latest.getId()))
                    .map(BillVotePosition::getPosition)
                    .findFirst()
                    .orElse("");

            // Get bill title
            String billTitle = "";
            Bill bill = billRepo.findById(latest.getBillId()).orElse(null);
            if (bill != null) {
                billTitle = bill.getTitle();
            }

            Map<String, Object> vote = new LinkedHashMap<>();
            vote.put("bill", billTitle.isEmpty() ? (latest.getTitle() != null ? latest.getTitle() : latest.getBillId()) : billTitle);
            vote.put("billId", latest.getBillId());
            vote.put("billTitle", billTitle);
            vote.put("date", latest.getDate() != null ? latest.getDate().format(DATE_FMT) : "");
            vote.put("vote", position);
            vote.put("question", latest.getQuestion() != null ? latest.getQuestion() : "");
            latestVoteMap.put(bioguideId, vote);
        }

        List<Map<String, Object>> politicians = legislators.stream().map(l -> {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("id", l.getBioguideId());
            p.put("name", l.getFullName());
            p.put("title", l.getTitle());
            p.put("party", l.getParty());
            p.put("state", l.getStateFull());
            p.put("photo", l.getPhotoUrl());
            p.put("district", l.getDistrict() != null ? ordinal(l.getDistrict()) : null);
            p.put("latestVote", latestVoteMap.get(l.getBioguideId()));
            return p;
        }).toList();

        return Map.of("politicians", politicians);
    }

    public Map<String, Object> getTrackedBills(UUID userId) {
        List<TrackedBill> tracked = trackedRepo.findByIdUserId(userId);
        if (tracked.isEmpty()) {
            return Map.of("bills", List.of());
        }

        List<String> ids = tracked.stream()
                .map(t -> t.getId().getBillId())
                .toList();

        List<Bill> bills = billRepo.findByBillIdIn(ids);
        List<Map<String, Object>> result = bills.stream().map(b -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", b.getBillId());
            m.put("number", b.getBillNumber() != null ? b.getBillNumber() : b.getBillId());
            m.put("title", b.getTitle());
            m.put("status", b.getStatus() != null ? b.getStatus() : "Unknown");
            m.put("lastAction", b.getLastActionDate() != null ? b.getLastActionDate().format(DATE_FMT) : "");
            m.put("lastActionText", b.getLastActionText() != null ? b.getLastActionText() : "");
            m.put("category", b.getPolicyArea() != null ? b.getPolicyArea() : "");
            return m;
        }).toList();

        return Map.of("bills", result);
    }

    public Map<String, Object> getTopicPreferences(UUID userId) {
        List<TopicPreference> prefs = topicPrefRepo.findByIdUserId(userId);
        List<String> topics = prefs.stream()
                .map(p -> p.getId().getTopic())
                .toList();
        return Map.of("topics", topics);
    }

    @Transactional
    public Map<String, Object> setTopicPreferences(UUID userId, List<String> topics) {
        topicPrefRepo.deleteByIdUserId(userId);
        for (String topic : topics) {
            TopicPreference pref = TopicPreference.create(userId, topic);
            topicPrefRepo.save(pref);
        }
        return Map.of("topics", topics);
    }

    @Transactional
    public void followPolitician(UUID userId, String politicianId) {
        if (!followedRepo.existsByIdUserIdAndIdPoliticianId(userId, politicianId)) {
            FollowedPolitician fp = FollowedPolitician.create(userId, politicianId);
            followedRepo.save(fp);
        }
    }

    @Transactional
    public void unfollowPolitician(UUID userId, String politicianId) {
        followedRepo.deleteByIdUserIdAndIdPoliticianId(userId, politicianId);
    }

    @Transactional
    public void trackBill(UUID userId, String billId) {
        if (!trackedRepo.existsByIdUserIdAndIdBillId(userId, billId)) {
            TrackedBill tb = TrackedBill.create(userId, billId);
            trackedRepo.save(tb);
        }
    }

    @Transactional
    public void untrackBill(UUID userId, String billId) {
        trackedRepo.deleteByIdUserIdAndIdBillId(userId, billId);
    }

    private static String ordinal(int n) {
        if (n == 0) return "At-Large";
        String[] suffixes = {"th", "st", "nd", "rd"};
        int mod100 = n % 100;
        String suffix = (mod100 >= 11 && mod100 <= 13) ? "th" : suffixes[Math.min(n % 10, 3)];
        return n + suffix;
    }
}
