package com.beyondthevote.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record BillDetailResponse(BillDetail bill) {

    public record BillDetail(
            String id,
            String number,
            String title,
            int congress,
            String introducedDate,
            String status,
            String summary,
            SponsorDto sponsor,
            List<CosponsorDto> cosponsors,
            String policyArea,
            List<String> topics,
            List<String> subjects,
            String congressGovUrl,
            List<ActionDto> actions,
            List<VoteDto> votes,
            @JsonProperty("_hasDetailedVotes")
            boolean hasDetailedVotes
    ) {}

    public record SponsorDto(
            String name,
            String bioguideId,
            String party,
            String state,
            Integer district
    ) {}

    public record CosponsorDto(
            String name,
            String bioguideId,
            String party,
            String state
    ) {}

    public record ActionDto(
            String date,
            String text,
            String type
    ) {}

    public record VoteDto(
            String id,
            String date,
            String chamber,
            String question,
            String result,
            String required,
            Integer yeas,
            Integer nays,
            Integer present,
            Integer notVoting,
            PartyBreakdownDto partyBreakdown,
            List<MemberPositionDto> memberPositions,
            String sourceUrl
    ) {}

    public record PartyBreakdownDto(
            PartyVoteDto democrat,
            PartyVoteDto republican,
            PartyVoteDto independent
    ) {}

    public record PartyVoteDto(
            int yea,
            int nay
    ) {}

    public record MemberPositionDto(
            String bioguideId,
            String name,
            String party,
            String state,
            String photoUrl,
            String position
    ) {}
}
