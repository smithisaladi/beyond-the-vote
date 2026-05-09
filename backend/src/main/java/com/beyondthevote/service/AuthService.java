package com.beyondthevote.service;

import com.beyondthevote.dto.request.LoginRequest;
import com.beyondthevote.dto.request.SignUpRequest;
import com.beyondthevote.dto.request.UpdateProfileRequest;
import com.beyondthevote.dto.response.UserResponse;
import com.beyondthevote.entity.AppUser;
import com.beyondthevote.entity.Profile;
import com.beyondthevote.entity.RefreshToken;
import com.beyondthevote.exception.InvalidRefreshTokenException;
import com.beyondthevote.repository.AppUserRepository;
import com.beyondthevote.repository.ProfileRepository;
import com.beyondthevote.repository.RefreshTokenRepository;
import com.beyondthevote.security.JwtService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.UUID;

@Service
public class AuthService {

    private final AppUserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final Duration refreshTokenTtl;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(AppUserRepository userRepository,
                       ProfileRepository profileRepository,
                       RefreshTokenRepository refreshTokenRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       @Value("${app.refresh-token.expiration}") long refreshTokenExpirationMs) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.refreshTokenTtl = Duration.ofMillis(refreshTokenExpirationMs);
    }

    public Duration getAccessTokenTtl() { return jwtService.getAccessTokenTtl(); }
    public Duration getRefreshTokenTtl() { return refreshTokenTtl; }

    @Transactional
    public IssuedTokens signUp(SignUpRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new IllegalArgumentException("Email already registered");
        }

        AppUser user = new AppUser(request.email(), passwordEncoder.encode(request.password()), request.fullName());
        user = userRepository.save(user);

        Profile profile = Profile.create(user.getId(), request.fullName());
        profileRepository.save(profile);

        return issueTokens(user, profile);
    }

    @Transactional
    public IssuedTokens login(LoginRequest request) {
        AppUser user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid email or password");
        }

        Profile profile = profileRepository.findById(user.getId()).orElse(null);
        return issueTokens(user, profile);
    }

    @Transactional
    public IssuedTokens refresh(String rawRefreshToken) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            throw new InvalidRefreshTokenException("Missing refresh token");
        }

        byte[] hash = sha256(rawRefreshToken);
        RefreshToken stored = refreshTokenRepository.findByTokenHash(hash)
                .orElseThrow(() -> new InvalidRefreshTokenException("Unknown refresh token"));

        OffsetDateTime now = OffsetDateTime.now();

        if (stored.getUsedAt() != null) {
            // Reuse detected — somebody is replaying a rotated token. Treat as
            // session compromise and revoke every active token for this user.
            refreshTokenRepository.revokeAllForUser(stored.getUserId(), now);
            throw new InvalidRefreshTokenException("Refresh token reuse detected");
        }
        if (stored.getRevokedAt() != null) {
            throw new InvalidRefreshTokenException("Refresh token revoked");
        }
        if (stored.getExpiresAt().isBefore(now)) {
            throw new InvalidRefreshTokenException("Refresh token expired");
        }

        AppUser user = userRepository.findById(stored.getUserId())
                .orElseThrow(() -> new InvalidRefreshTokenException("User not found"));
        Profile profile = profileRepository.findById(user.getId()).orElse(null);

        IssuedTokens issued = issueTokens(user, profile);
        stored.markUsed(now, sha256(issued.refreshToken()));
        refreshTokenRepository.save(stored);

        return issued;
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            return;
        }
        byte[] hash = sha256(rawRefreshToken);
        refreshTokenRepository.findByTokenHash(hash).ifPresent(token -> {
            if (token.getRevokedAt() == null) {
                token.revoke(OffsetDateTime.now());
                refreshTokenRepository.save(token);
            }
        });
    }

    @Transactional
    public UserResponse updateProfile(UUID userId, UpdateProfileRequest request) {
        AppUser user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (request.fullName() != null) {
            user.setFullName(request.fullName());
        }

        if (request.newPassword() != null && !request.newPassword().isBlank()) {
            if (request.currentPassword() == null
                    || !passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
                throw new IllegalArgumentException("Current password is incorrect");
            }
            user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        }

        userRepository.save(user);

        Profile profile = profileRepository.findById(userId).orElse(null);
        if (profile != null && request.displayName() != null) {
            profile.setDisplayName(request.displayName());
            profileRepository.save(profile);
        }

        return toUserResponse(user, profile);
    }

    public UserResponse getCurrentUser(UUID userId) {
        AppUser user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        Profile profile = profileRepository.findById(userId).orElse(null);
        return toUserResponse(user, profile);
    }

    private IssuedTokens issueTokens(AppUser user, Profile profile) {
        String accessToken = jwtService.generateAccessToken(user.getId(), user.getEmail());
        String rawRefresh = generateRawRefreshToken();
        OffsetDateTime expiresAt = OffsetDateTime.now().plus(refreshTokenTtl);
        refreshTokenRepository.save(new RefreshToken(sha256(rawRefresh), user.getId(), expiresAt));
        return new IssuedTokens(accessToken, rawRefresh, toUserResponse(user, profile));
    }

    private String generateRawRefreshToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static UserResponse toUserResponse(AppUser user, Profile profile) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                profile != null ? profile.getDisplayName() : null
        );
    }

    public record IssuedTokens(String accessToken, String refreshToken, UserResponse user) {}
}
