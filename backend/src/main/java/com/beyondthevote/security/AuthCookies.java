package com.beyondthevote.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Builders for the two auth cookies. {@code bv_at} carries the JWT access
 * token (15min, path=/api). {@code bv_rt} carries the opaque refresh token
 * (7d, path=/api/auth so /refresh and /logout can both see it).
 *
 * SameSite=Lax + same-origin deployment is the CSRF defense. Pair with
 * {@link OriginCheckFilter} for state-changing requests.
 */
@Component
public class AuthCookies {

    public static final String ACCESS_TOKEN_COOKIE = "bv_at";
    public static final String REFRESH_TOKEN_COOKIE = "bv_rt";

    private static final String ACCESS_PATH = "/api";
    private static final String REFRESH_PATH = "/api/auth";

    private final boolean secure;

    public AuthCookies(@Value("${app.cookies.secure:true}") boolean secure) {
        this.secure = secure;
    }

    public ResponseCookie accessToken(String value, Duration ttl) {
        return base(ACCESS_TOKEN_COOKIE, value, ACCESS_PATH).maxAge(ttl).build();
    }

    public ResponseCookie refreshToken(String value, Duration ttl) {
        return base(REFRESH_TOKEN_COOKIE, value, REFRESH_PATH).maxAge(ttl).build();
    }

    public ResponseCookie clearAccessToken() {
        return base(ACCESS_TOKEN_COOKIE, "", ACCESS_PATH).maxAge(0).build();
    }

    public ResponseCookie clearRefreshToken() {
        return base(REFRESH_TOKEN_COOKIE, "", REFRESH_PATH).maxAge(0).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String name, String value, String path) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(secure)
                .sameSite("Lax")
                .path(path);
    }
}
