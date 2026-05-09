package com.beyondthevote.dto.response;

import java.util.List;

public record RepresentativeResponse(List<Representative> representatives) {

    public record Representative(
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
