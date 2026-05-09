package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "followed_politicians")
public class FollowedPolitician {

    @EmbeddedId
    private FollowedPoliticianId id;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected FollowedPolitician() {
    }

    public FollowedPolitician(FollowedPoliticianId id) {
        this.id = id;
    }

    public static FollowedPolitician create(UUID userId, String politicianId) {
        return new FollowedPolitician(new FollowedPoliticianId(userId, politicianId));
    }

    public FollowedPoliticianId getId() {
        return id;
    }

    public void setId(FollowedPoliticianId id) {
        this.id = id;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    @Embeddable
    public static class FollowedPoliticianId implements Serializable {

        @Column(name = "user_id")
        private UUID userId;

        @Column(name = "politician_id")
        private String politicianId;

        protected FollowedPoliticianId() {
        }

        public FollowedPoliticianId(UUID userId, String politicianId) {
            this.userId = userId;
            this.politicianId = politicianId;
        }

        public UUID getUserId() {
            return userId;
        }

        public String getPoliticianId() {
            return politicianId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            FollowedPoliticianId that = (FollowedPoliticianId) o;
            return Objects.equals(userId, that.userId)
                    && Objects.equals(politicianId, that.politicianId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, politicianId);
        }
    }
}
