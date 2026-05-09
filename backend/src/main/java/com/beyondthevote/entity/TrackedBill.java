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
@Table(name = "tracked_bills")
public class TrackedBill {

    @EmbeddedId
    private TrackedBillId id;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected TrackedBill() {
    }

    public TrackedBill(TrackedBillId id) {
        this.id = id;
    }

    public static TrackedBill create(UUID userId, String billId) {
        return new TrackedBill(new TrackedBillId(userId, billId));
    }

    public TrackedBillId getId() {
        return id;
    }

    public void setId(TrackedBillId id) {
        this.id = id;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    @Embeddable
    public static class TrackedBillId implements Serializable {

        @Column(name = "user_id")
        private UUID userId;

        @Column(name = "bill_id")
        private String billId;

        protected TrackedBillId() {
        }

        public TrackedBillId(UUID userId, String billId) {
            this.userId = userId;
            this.billId = billId;
        }

        public UUID getUserId() {
            return userId;
        }

        public String getBillId() {
            return billId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            TrackedBillId that = (TrackedBillId) o;
            return Objects.equals(userId, that.userId)
                    && Objects.equals(billId, that.billId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, billId);
        }
    }
}
