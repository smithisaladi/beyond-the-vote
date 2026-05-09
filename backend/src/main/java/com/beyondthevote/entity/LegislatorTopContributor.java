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
@Table(name = "legislator_top_contributors")
public class LegislatorTopContributor {

    @EmbeddedId
    private LegislatorTopContributorId id;

    @Column(name = "individual_total")
    private BigDecimal individualTotal;

    @Column(name = "pac_total")
    private BigDecimal pacTotal;

    @Column(name = "grand_total")
    private BigDecimal grandTotal;

    @Column(name = "rank")
    private Integer rank;

    @Column(name = "cmte_id")
    private String cmteId;

    protected LegislatorTopContributor() {
    }

    public LegislatorTopContributorId getId() {
        return id;
    }

    public BigDecimal getIndividualTotal() {
        return individualTotal;
    }

    public BigDecimal getPacTotal() {
        return pacTotal;
    }

    public BigDecimal getGrandTotal() {
        return grandTotal;
    }

    public Integer getRank() {
        return rank;
    }

    public String getCmteId() {
        return cmteId;
    }

    @Embeddable
    public static class LegislatorTopContributorId implements Serializable {

        @Column(name = "bioguide_id")
        private String bioguideId;

        @Column(name = "cycle")
        private Integer cycle;

        @Column(name = "org_name")
        private String orgName;

        protected LegislatorTopContributorId() {
        }

        public LegislatorTopContributorId(String bioguideId, Integer cycle, String orgName) {
            this.bioguideId = bioguideId;
            this.cycle = cycle;
            this.orgName = orgName;
        }

        public String getBioguideId() {
            return bioguideId;
        }

        public Integer getCycle() {
            return cycle;
        }

        public String getOrgName() {
            return orgName;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            LegislatorTopContributorId that = (LegislatorTopContributorId) o;
            return Objects.equals(bioguideId, that.bioguideId)
                    && Objects.equals(cycle, that.cycle)
                    && Objects.equals(orgName, that.orgName);
        }

        @Override
        public int hashCode() {
            return Objects.hash(bioguideId, cycle, orgName);
        }
    }
}
