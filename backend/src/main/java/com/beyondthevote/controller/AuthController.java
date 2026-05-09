package com.beyondthevote.controller;

import com.beyondthevote.dto.request.LoginRequest;
import com.beyondthevote.dto.request.SignUpRequest;
import com.beyondthevote.dto.request.UpdateProfileRequest;
import com.beyondthevote.dto.response.UserResponse;
import com.beyondthevote.security.AuthCookies;
import com.beyondthevote.service.AuthService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final AuthCookies cookies;

    public AuthController(AuthService authService, AuthCookies cookies) {
        this.authService = authService;
        this.cookies = cookies;
    }

    @PostMapping("/signup")
    public ResponseEntity<UserResponse> signUp(@Valid @RequestBody SignUpRequest request) {
        AuthService.IssuedTokens issued = authService.signUp(request);
        return tokenResponse(HttpStatus.CREATED, issued);
    }

    @PostMapping("/login")
    public ResponseEntity<UserResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthService.IssuedTokens issued = authService.login(request);
        return tokenResponse(HttpStatus.OK, issued);
    }

    @PostMapping("/refresh")
    public ResponseEntity<Void> refresh(HttpServletRequest request) {
        String raw = readRefreshCookie(request);
        AuthService.IssuedTokens issued = authService.refresh(raw);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE,
                        cookies.accessToken(issued.accessToken(), authService.getAccessTokenTtl()).toString())
                .header(HttpHeaders.SET_COOKIE,
                        cookies.refreshToken(issued.refreshToken(), authService.getRefreshTokenTtl()).toString())
                .build();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        authService.logout(readRefreshCookie(request));
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.clearAccessToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.clearRefreshToken().toString())
                .build();
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> getCurrentUser(Authentication authentication) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(authService.getCurrentUser(userId));
    }

    @PutMapping("/profile")
    public ResponseEntity<UserResponse> updateProfile(
            Authentication authentication,
            @RequestBody UpdateProfileRequest request) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(authService.updateProfile(userId, request));
    }

    private ResponseEntity<UserResponse> tokenResponse(HttpStatus status, AuthService.IssuedTokens issued) {
        ResponseCookie at = cookies.accessToken(issued.accessToken(), authService.getAccessTokenTtl());
        ResponseCookie rt = cookies.refreshToken(issued.refreshToken(), authService.getRefreshTokenTtl());
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, at.toString())
                .header(HttpHeaders.SET_COOKIE, rt.toString())
                .body(issued.user());
    }

    private static String readRefreshCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        for (Cookie c : request.getCookies()) {
            if (AuthCookies.REFRESH_TOKEN_COOKIE.equals(c.getName())) {
                return c.getValue();
            }
        }
        return null;
    }
}
