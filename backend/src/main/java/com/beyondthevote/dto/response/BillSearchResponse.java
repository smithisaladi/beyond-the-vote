package com.beyondthevote.dto.response;

import java.util.List;

public record BillSearchResponse(
        String query,
        List<BillSearchResultDto> results,
        int count
) {
    public record BillSearchResultDto(
            String billId,
            int congress,
            String title,
            String billNumber,
            String status,
            String summary,
            String sponsorName,
            String sponsorBioguideId,
            String sponsorParty,
            String introducedDate,
            String policyArea,
            String congressGovUrl,
            String lastActionText,
            String lastActionDate,
            List<String> topics,
            double rrfScore
    ) {}
}
