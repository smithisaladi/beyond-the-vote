package com.beyondthevote.dto.response;

import java.util.List;

public record BillListResponse(
        List<BillSummaryDto> bills,
        PaginationDto pagination
) {
    public record BillSummaryDto(
            String id,
            String number,
            String title,
            String sponsor,
            String party,
            String status,
            List<String> topics,
            String lastAction,
            long lastActionTimestamp,
            String summary
    ) {}

    public record PaginationDto(
            long total,
            int limit,
            int offset
    ) {}
}
