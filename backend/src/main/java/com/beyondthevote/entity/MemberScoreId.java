package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class MemberScoreId implements Serializable {

    @Column(name = "bioguide_id", nullable = false)
    private String bioguideId;

    @Column(name = "congress", nullable = false)
    private Integer congress;

    public MemberScoreId() {
    }

    public MemberScoreId(String bioguideId, Integer congress) {
        this.bioguideId = bioguideId;
        this.congress = congress;
    }

    public String getBioguideId() {
        return bioguideId;
    }

    public void setBioguideId(String bioguideId) {
        this.bioguideId = bioguideId;
    }

    public Integer getCongress() {
        return congress;
    }

    public void setCongress(Integer congress) {
        this.congress = congress;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        MemberScoreId that = (MemberScoreId) o;
        return Objects.equals(bioguideId, that.bioguideId) &&
                Objects.equals(congress, that.congress);
    }

    @Override
    public int hashCode() {
        return Objects.hash(bioguideId, congress);
    }
}
