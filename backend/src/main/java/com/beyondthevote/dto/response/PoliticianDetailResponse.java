package com.beyondthevote.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PoliticianDetailResponse(PoliticianDetail politician) {

    public record PoliticianDetail(
            String id,
            String bioguideId,
            String name,
            String title,
            String party,
            String state,
            String stateCode,
            String district,
            String since,
            String photo,
            String photoCredit,
            String website,
            String address,
            String phone,
            String twitter,
            String fecUrl,
            StatsDto stats,
            Integer nextElectionYear,
            List<VoteDto> votes,
            List<BillDto> bills,
            List<DonorDto> donors,
            List<DonorDto> pacDonors,
            List<TopContributorDto> topContributors,
            FundingBreakdownDto fundingBreakdown,
            List<CommitteeDto> committees,
            String donorAlignmentSyncedAt,
            boolean donorAlignmentIsStale,
            @JsonProperty("_sources")
            Map<String, String> sources
    ) {}

    public record StatsDto(
            int yearsInOffice,
            Double attendance,
            Double ideologyScore,
            String ideologyLabel,
            int billVotesCast,
            Double votedWithParty
    ) {}

    public record VoteDto(
            String id,
            String bill,
            String billId,
            String billTitle,
            String date,
            String vote,
            String question,
            List<Object> donorAlignments
    ) {}

    public record BillDto(
            String billId,
            String number,
            String title,
            String introducedDate,
            String status,
            String congressGovUrl
    ) {}

    public record DonorDto(
            int rank,
            String name,
            String amount,
            String category
    ) {}

    public record TopContributorDto(
            int rank,
            String orgName,
            String total,
            String cmteId
    ) {}

    public record FundingBreakdownDto(
            double pac,
            double pacPct,
            double individualLarge,
            double individualLargePct,
            double individualSmall,
            double individualSmallPct,
            double partyContributions,
            double partyContributionsPct,
            double selfFunded,
            double selfFundedPct,
            double other,
            double otherPct,
            double total,
            double superPacFor,
            double superPacAgainst,
            double inStateTotal,
            double outOfStateTotal,
            double inStatePct,
            double outOfStatePct,
            int cycle,
            int minCycle
    ) {}

    public record CommitteeDto(
            String name,
            String url,
            String chamber,
            String title
    ) {}
}
