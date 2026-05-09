package com.beyondthevote.dto.response;

import java.util.UUID;

public record UserResponse(
        UUID id,
        String email,
        String fullName,
        String displayName
) {}
