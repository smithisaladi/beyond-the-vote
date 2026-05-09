package com.beyondthevote.dto.response;

import java.math.BigDecimal;
import java.util.List;

public record DonorListResponse(
        List<ContributorDto> contributors,
        PaginationDto pagination
) {
    public record ContributorDto(
            String cmteId,
            long rank,
            String cmteName,
            BigDecimal directTotal,
            BigDecimal ieForTotal,
            BigDecimal ieAgainstTotal,
            BigDecimal totalContributions,
            long recipientCount,
            List<TopRecipientDto> topRecipients
    ) {}

    public record TopRecipientDto(
            String bioguideId,
            String name,
            String party,
            String state,
            String chamber,
            BigDecimal amount
    ) {}

    public record PaginationDto(
            long total,
            int limit,
            int offset
    ) {}
}
