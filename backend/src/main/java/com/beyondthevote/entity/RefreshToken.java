package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    @Column(name = "id")
    private UUID id;

    @Column(name = "token_hash", nullable = false, unique = true)
    private byte[] tokenHash;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "revoked_at")
    private OffsetDateTime revokedAt;

    @Column(name = "used_at")
    private OffsetDateTime usedAt;

    @Column(name = "replaced_by")
    private byte[] replacedBy;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected RefreshToken() {
    }

    public RefreshToken(byte[] tokenHash, UUID userId, OffsetDateTime expiresAt) {
        this.tokenHash = tokenHash;
        this.userId = userId;
        this.expiresAt = expiresAt;
        this.createdAt = OffsetDateTime.now();
    }

    public UUID getId() { return id; }
    public byte[] getTokenHash() { return tokenHash; }
    public UUID getUserId() { return userId; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public OffsetDateTime getRevokedAt() { return revokedAt; }
    public OffsetDateTime getUsedAt() { return usedAt; }
    public byte[] getReplacedBy() { return replacedBy; }
    public OffsetDateTime getCreatedAt() { return createdAt; }

    public void markUsed(OffsetDateTime at, byte[] replacedByHash) {
        this.usedAt = at;
        this.replacedBy = replacedByHash;
    }

    public void revoke(OffsetDateTime at) {
        this.revokedAt = at;
    }
}
