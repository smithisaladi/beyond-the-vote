package com.beyondthevote.dto.response;

import java.math.BigDecimal;
import java.util.List;

public record DonorDetailResponse(
        String cmteId,
        String name,
        String connectedOrg,
        BigDecimal totalContributions,
        BigDecimal directTotal,
        BigDecimal ieForTotal,
        BigDecimal ieAgainstTotal,
        long recipientCount,
        List<RecipientDto> recipients,
        String summary
) {
    public record RecipientDto(
            String bioguideId,
            String name,
            String party,
            String state,
            String chamber,
            BigDecimal amount,
            BigDecimal direct,
            BigDecimal ieFor
    ) {}
}
