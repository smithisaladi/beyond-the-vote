package com.beyondthevote.entity;

import io.hypersistence.utils.hibernate.type.json.JsonBinaryType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.Type;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Immutable
@Table(name = "contributor_leaderboard_cache")
public class ContributorLeaderboardCache {

    @Id
    @Column(name = "cmte_id")
    private String cmteId;

    @Column(name = "cmte_name", nullable = false)
    private String cmteName;

    @Column(name = "direct_total", nullable = false)
    private BigDecimal directTotal;

    @Column(name = "ie_for_total", nullable = false)
    private BigDecimal ieForTotal;

    @Column(name = "ie_against_total", nullable = false)
    private BigDecimal ieAgainstTotal;

    @Column(name = "total_contributions", nullable = false)
    private BigDecimal totalContributions;

    @Column(name = "recipient_count", nullable = false)
    private Long recipientCount;

    @Type(JsonBinaryType.class)
    @Column(name = "top_recipients", nullable = false, columnDefinition = "jsonb")
    private String topRecipients;

    @Column(name = "computed_at", nullable = false)
    private OffsetDateTime computedAt;

    protected ContributorLeaderboardCache() {
    }

    public String getCmteId() {
        return cmteId;
    }

    public String getCmteName() {
        return cmteName;
    }

    public BigDecimal getDirectTotal() {
        return directTotal;
    }

    public BigDecimal getIeForTotal() {
        return ieForTotal;
    }

    public BigDecimal getIeAgainstTotal() {
        return ieAgainstTotal;
    }

    public BigDecimal getTotalContributions() {
        return totalContributions;
    }

    public Long getRecipientCount() {
        return recipientCount;
    }

    public String getTopRecipients() {
        return topRecipients;
    }

    public OffsetDateTime getComputedAt() {
        return computedAt;
    }
}
