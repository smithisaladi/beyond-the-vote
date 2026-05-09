package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class CommitteeMembershipId implements Serializable {

    @Column(name = "bioguide_id", nullable = false)
    private String bioguideId;

    @Column(name = "committee_id", nullable = false)
    private String committeeId;

    public CommitteeMembershipId() {
    }

    public CommitteeMembershipId(String bioguideId, String committeeId) {
        this.bioguideId = bioguideId;
        this.committeeId = committeeId;
    }

    public String getBioguideId() {
        return bioguideId;
    }

    public void setBioguideId(String bioguideId) {
        this.bioguideId = bioguideId;
    }

    public String getCommitteeId() {
        return committeeId;
    }

    public void setCommitteeId(String committeeId) {
        this.committeeId = committeeId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        CommitteeMembershipId that = (CommitteeMembershipId) o;
        return Objects.equals(bioguideId, that.bioguideId) &&
                Objects.equals(committeeId, that.committeeId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(bioguideId, committeeId);
    }
}
