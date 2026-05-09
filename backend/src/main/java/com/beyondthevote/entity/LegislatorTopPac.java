package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

@Entity
@Immutable
@Table(name = "legislator_top_pacs")
public class LegislatorTopPac {

    @EmbeddedId
    private LegislatorTopPacId id;

    @Column(name = "cmte_name")
    private String cmteName;

    @Column(name = "connected_org")
    private String connectedOrg;

    @Column(name = "industry")
    private String industry;

    @Column(name = "direct_contribution")
    private BigDecimal directContribution;

    @Column(name = "ie_for")
    private BigDecimal ieFor;

    @Column(name = "ie_against")
    private BigDecimal ieAgainst;

    @Column(name = "total_support")
    private BigDecimal totalSupport;

    @Column(name = "rank")
    private Integer rank;

    protected LegislatorTopPac() {
    }

    public LegislatorTopPacId getId() {
        return id;
    }

    public String getCmteName() {
        return cmteName;
    }

    public String getConnectedOrg() {
        return connectedOrg;
    }

    public String getIndustry() {
        return industry;
    }

    public BigDecimal getDirectContribution() {
        return directContribution;
    }

    public BigDecimal getIeFor() {
        return ieFor;
    }

    public BigDecimal getIeAgainst() {
        return ieAgainst;
    }

    public BigDecimal getTotalSupport() {
        return totalSupport;
    }

    public Integer getRank() {
        return rank;
    }

    @Embeddable
    public static class LegislatorTopPacId implements Serializable {

        @Column(name = "bioguide_id")
        private String bioguideId;

        @Column(name = "cycle")
        private Integer cycle;

        @Column(name = "cmte_id")
        private String cmteId;

        protected LegislatorTopPacId() {
        }

        public LegislatorTopPacId(String bioguideId, Integer cycle, String cmteId) {
            this.bioguideId = bioguideId;
            this.cycle = cycle;
            this.cmteId = cmteId;
        }

        public String getBioguideId() {
            return bioguideId;
        }

        public Integer getCycle() {
            return cycle;
        }

        public String getCmteId() {
            return cmteId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            LegislatorTopPacId that = (LegislatorTopPacId) o;
            return Objects.equals(bioguideId, that.bioguideId)
                    && Objects.equals(cycle, that.cycle)
                    && Objects.equals(cmteId, that.cmteId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(bioguideId, cycle, cmteId);
        }
    }
}
