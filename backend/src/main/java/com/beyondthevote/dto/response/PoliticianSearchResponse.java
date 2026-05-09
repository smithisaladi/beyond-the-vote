package com.beyondthevote.dto.response;

import java.util.List;

public record PoliticianSearchResponse(List<PoliticianSummary> politicians) {

    public record PoliticianSummary(
            String id,
            String bioguideId,
            String name,
            String title,
            String party,
            String state,
            String district,
            String photo,
            String since,
            String website,
            String phone,
            Double ideologyScore
    ) {}
}
