package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class BillVotePositionId implements Serializable {

    @Column(name = "vote_id", nullable = false)
    private String voteId;

    @Column(name = "bioguide_id", nullable = false)
    private String bioguideId;

    public BillVotePositionId() {
    }

    public BillVotePositionId(String voteId, String bioguideId) {
        this.voteId = voteId;
        this.bioguideId = bioguideId;
    }

    public String getVoteId() {
        return voteId;
    }

    public void setVoteId(String voteId) {
        this.voteId = voteId;
    }

    public String getBioguideId() {
        return bioguideId;
    }

    public void setBioguideId(String bioguideId) {
        this.bioguideId = bioguideId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        BillVotePositionId that = (BillVotePositionId) o;
        return Objects.equals(voteId, that.voteId) &&
                Objects.equals(bioguideId, that.bioguideId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(voteId, bioguideId);
    }
}
