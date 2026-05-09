package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "member_scores")
public class MemberScore {

    @EmbeddedId
    private MemberScoreId id;

    @Column(name = "chamber", nullable = false)
    private String chamber;

    @Column(name = "nominate_dim1", precision = 6, scale = 3)
    private BigDecimal nominateDim1;

    @Column(name = "nominate_dim2", precision = 6, scale = 3)
    private BigDecimal nominateDim2;

    @Column(name = "num_votes")
    private Integer numVotes;

    @Column(name = "geo_mean_prob", precision = 6, scale = 3)
    private BigDecimal geoMeanProb;

    @Column(name = "synced_at")
    private OffsetDateTime syncedAt;

    public MemberScore() {
    }

    public MemberScoreId getId() {
        return id;
    }

    public void setId(MemberScoreId id) {
        this.id = id;
    }

    public String getChamber() {
        return chamber;
    }

    public void setChamber(String chamber) {
        this.chamber = chamber;
    }

    public BigDecimal getNominateDim1() {
        return nominateDim1;
    }

    public void setNominateDim1(BigDecimal nominateDim1) {
        this.nominateDim1 = nominateDim1;
    }

    public BigDecimal getNominateDim2() {
        return nominateDim2;
    }

    public void setNominateDim2(BigDecimal nominateDim2) {
        this.nominateDim2 = nominateDim2;
    }

    public Integer getNumVotes() {
        return numVotes;
    }

    public void setNumVotes(Integer numVotes) {
        this.numVotes = numVotes;
    }

    public BigDecimal getGeoMeanProb() {
        return geoMeanProb;
    }

    public void setGeoMeanProb(BigDecimal geoMeanProb) {
        this.geoMeanProb = geoMeanProb;
    }

    public OffsetDateTime getSyncedAt() {
        return syncedAt;
    }

    public void setSyncedAt(OffsetDateTime syncedAt) {
        this.syncedAt = syncedAt;
    }
}
