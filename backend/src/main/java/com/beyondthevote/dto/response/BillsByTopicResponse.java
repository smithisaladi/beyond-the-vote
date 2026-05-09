package com.beyondthevote.dto.response;

import java.util.List;

public record BillsByTopicResponse(
        String slug,
        List<BillTopicDto> bills,
        int count
) {
    public record BillTopicDto(
            String id,
            String number,
            String title,
            String status,
            List<String> topics,
            String summary
    ) {}
}
