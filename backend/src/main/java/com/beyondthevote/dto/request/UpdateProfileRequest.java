package com.beyondthevote.dto.request;

public record UpdateProfileRequest(
        String fullName,
        String displayName,
        String currentPassword,
        String newPassword
) {}
