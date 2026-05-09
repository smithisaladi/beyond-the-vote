package com.beyondthevote.service;

import com.beyondthevote.entity.AppUser;
import com.beyondthevote.entity.Profile;
import com.beyondthevote.entity.RefreshToken;
import com.beyondthevote.exception.InvalidRefreshTokenException;
import com.beyondthevote.repository.AppUserRepository;
import com.beyondthevote.repository.ProfileRepository;
import com.beyondthevote.repository.RefreshTokenRepository;
import com.beyondthevote.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock private AppUserRepository userRepository;
    @Mock private ProfileRepository profileRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private JwtService jwtService;

    private AuthService service;

    private final UUID userId = UUID.randomUUID();
    private AppUser user;

    @BeforeEach
    void setUp() {
        service = new AuthService(
                userRepository,
                profileRepository,
                refreshTokenRepository,
                passwordEncoder,
                jwtService,
                Duration.ofDays(7).toMillis()
        );

        user = new AppUser("a@b.c", "hash", "Alice");
        setField(user, "id", userId);
    }

    @Test
    void refresh_rotates_tokens_and_marks_original_used() {
        String originalRaw = "raw-original";
        RefreshToken stored = new RefreshToken(sha256(originalRaw), userId, OffsetDateTime.now().plusDays(7));

        when(refreshTokenRepository.findByTokenHash(sha256(originalRaw))).thenReturn(Optional.of(stored));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(profileRepository.findById(userId)).thenReturn(Optional.empty());
        when(jwtService.generateAccessToken(eq(userId), eq("a@b.c"))).thenReturn("new-jwt");

        AuthService.IssuedTokens issued = service.refresh(originalRaw);

        assertThat(issued.accessToken()).isEqualTo("new-jwt");
        assertThat(issued.refreshToken()).isNotEqualTo(originalRaw);

        // Original was marked used and linked to the new token's hash.
        assertThat(stored.getUsedAt()).isNotNull();
        assertThat(stored.getReplacedBy()).isEqualTo(sha256(issued.refreshToken()));

        // No reuse-detection cascade.
        verify(refreshTokenRepository, never()).revokeAllForUser(any(), any());

        // Both saves happened: new token persisted, original updated.
        verify(refreshTokenRepository, times(2)).save(any(RefreshToken.class));
    }

    @Test
    void refresh_with_already_used_token_revokes_entire_user_session() {
        String reusedRaw = "raw-reused";
        RefreshToken stored = new RefreshToken(sha256(reusedRaw), userId, OffsetDateTime.now().plusDays(7));
        stored.markUsed(OffsetDateTime.now().minusMinutes(5), new byte[]{0x01});

        when(refreshTokenRepository.findByTokenHash(sha256(reusedRaw))).thenReturn(Optional.of(stored));

        assertThatThrownBy(() -> service.refresh(reusedRaw))
                .isInstanceOf(InvalidRefreshTokenException.class)
                .hasMessageContaining("reuse");

        verify(refreshTokenRepository).revokeAllForUser(eq(userId), any());
        verify(refreshTokenRepository, never()).save(any());
        verify(jwtService, never()).generateAccessToken(any(), any());
    }

    @Test
    void refresh_with_revoked_token_rejects_without_issuing() {
        String raw = "raw-revoked";
        RefreshToken stored = new RefreshToken(sha256(raw), userId, OffsetDateTime.now().plusDays(7));
        stored.revoke(OffsetDateTime.now().minusMinutes(1));

        when(refreshTokenRepository.findByTokenHash(sha256(raw))).thenReturn(Optional.of(stored));

        assertThatThrownBy(() -> service.refresh(raw))
                .isInstanceOf(InvalidRefreshTokenException.class)
                .hasMessageContaining("revoked");

        verify(refreshTokenRepository, never()).revokeAllForUser(any(), any());
        verify(refreshTokenRepository, never()).save(any());
    }

    @Test
    void refresh_with_expired_token_rejects() {
        String raw = "raw-expired";
        RefreshToken stored = new RefreshToken(sha256(raw), userId, OffsetDateTime.now().minusMinutes(1));

        when(refreshTokenRepository.findByTokenHash(sha256(raw))).thenReturn(Optional.of(stored));

        assertThatThrownBy(() -> service.refresh(raw))
                .isInstanceOf(InvalidRefreshTokenException.class)
                .hasMessageContaining("expired");

        verify(refreshTokenRepository, never()).save(any());
    }

    @Test
    void refresh_with_unknown_token_rejects() {
        when(refreshTokenRepository.findByTokenHash(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.refresh("nope"))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void refresh_with_blank_token_rejects() {
        assertThatThrownBy(() -> service.refresh(""))
                .isInstanceOf(InvalidRefreshTokenException.class);
        assertThatThrownBy(() -> service.refresh(null))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void logout_revokes_the_matching_token() {
        String raw = "raw-active";
        RefreshToken stored = new RefreshToken(sha256(raw), userId, OffsetDateTime.now().plusDays(7));

        when(refreshTokenRepository.findByTokenHash(sha256(raw))).thenReturn(Optional.of(stored));

        service.logout(raw);

        assertThat(stored.getRevokedAt()).isNotNull();
        verify(refreshTokenRepository).save(stored);
    }

    @Test
    void logout_is_idempotent_on_already_revoked_token() {
        String raw = "raw-revoked";
        RefreshToken stored = new RefreshToken(sha256(raw), userId, OffsetDateTime.now().plusDays(7));
        OffsetDateTime originalRevocation = OffsetDateTime.now().minusHours(1);
        stored.revoke(originalRevocation);

        when(refreshTokenRepository.findByTokenHash(sha256(raw))).thenReturn(Optional.of(stored));

        service.logout(raw);

        // Second logout doesn't bump the timestamp or trigger another save.
        assertThat(stored.getRevokedAt()).isEqualTo(originalRevocation);
        verify(refreshTokenRepository, never()).save(any());
    }

    @Test
    void logout_with_unknown_token_is_a_noop() {
        when(refreshTokenRepository.findByTokenHash(any())).thenReturn(Optional.empty());
        service.logout("anything");
        verify(refreshTokenRepository, never()).save(any());
    }

    @Test
    void logout_with_no_token_is_a_noop() {
        service.logout(null);
        service.logout("");
        verify(refreshTokenRepository, never()).findByTokenHash(any());
    }

    @Test
    void issued_refresh_token_is_persisted_on_login() {
        when(userRepository.findByEmail("a@b.c")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("pw", "hash")).thenReturn(true);
        when(profileRepository.findById(userId)).thenReturn(Optional.empty());
        when(jwtService.generateAccessToken(any(), any())).thenReturn("jwt");

        AuthService.IssuedTokens issued = service.login(new com.beyondthevote.dto.request.LoginRequest("a@b.c", "pw"));

        assertThat(issued.refreshToken()).isNotBlank();
        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository).save(captor.capture());
        assertThat(captor.getValue().getTokenHash()).isEqualTo(sha256(issued.refreshToken()));
        assertThat(captor.getValue().getUserId()).isEqualTo(userId);
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static void setField(Object target, String name, Object value) {
        try {
            Field f = target.getClass().getDeclaredField(name);
            f.setAccessible(true);
            f.set(target, value);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
