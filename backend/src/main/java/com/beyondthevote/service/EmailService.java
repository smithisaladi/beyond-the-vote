package com.beyondthevote.service;

/**
 * Outbound email abstraction. No production implementation yet — password-reset
 * endpoints stay disabled until a provider (Resend / SES / Postmark) is wired.
 */
public interface EmailService {

    void sendPasswordReset(String email, String resetUrl);
}
