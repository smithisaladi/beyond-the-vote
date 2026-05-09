package com.beyondthevote.entity;

import io.hypersistence.utils.hibernate.type.json.JsonBinaryType;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.Type;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

@Entity
@Immutable
@Table(name = "legislator_funding_summary")
public class LegislatorFundingSummary {

    @EmbeddedId
    private LegislatorFundingSummaryId id;

    @Column(name = "total_receipts")
    private BigDecimal totalReceipts;

    @Column(name = "pac_direct_total")
    private BigDecimal pacDirectTotal;

    @Column(name = "pac_direct_pct")
    private BigDecimal pacDirectPct;

    @Column(name = "superpac_ie_for")
    private BigDecimal superpacIeFor;

    @Column(name = "superpac_ie_against")
    private BigDecimal superpacIeAgainst;

    @Column(name = "large_donor_total")
    private BigDecimal largeDonorTotal;

    @Column(name = "large_donor_pct")
    private BigDecimal largeDonorPct;

    @Column(name = "small_donor_total")
    private BigDecimal smallDonorTotal;

    @Column(name = "small_donor_pct")
    private BigDecimal smallDonorPct;

    @Column(name = "in_state_total")
    private BigDecimal inStateTotal;

    @Column(name = "out_of_state_total")
    private BigDecimal outOfStateTotal;

    @Column(name = "out_of_state_pct")
    private BigDecimal outOfStatePct;

    @Column(name = "dc_donor_total")
    private BigDecimal dcDonorTotal;

    @Type(JsonBinaryType.class)
    @Column(name = "top_industries", columnDefinition = "jsonb")
    private String topIndustries;

    @Column(name = "pol_pty_total")
    private BigDecimal polPtyTotal;

    @Column(name = "pol_pty_pct")
    private BigDecimal polPtyPct;

    @Column(name = "self_funded_total")
    private BigDecimal selfFundedTotal;

    @Column(name = "self_funded_pct")
    private BigDecimal selfFundedPct;

    @Column(name = "other_total")
    private BigDecimal otherTotal;

    @Column(name = "other_pct")
    private BigDecimal otherPct;

    protected LegislatorFundingSummary() {
    }

    public LegislatorFundingSummaryId getId() {
        return id;
    }

    public BigDecimal getTotalReceipts() {
        return totalReceipts;
    }

    public BigDecimal getPacDirectTotal() {
        return pacDirectTotal;
    }

    public BigDecimal getPacDirectPct() {
        return pacDirectPct;
    }

    public BigDecimal getSuperpacIeFor() {
        return superpacIeFor;
    }

    public BigDecimal getSuperpacIeAgainst() {
        return superpacIeAgainst;
    }

    public BigDecimal getLargeDonorTotal() {
        return largeDonorTotal;
    }

    public BigDecimal getLargeDonorPct() {
        return largeDonorPct;
    }

    public BigDecimal getSmallDonorTotal() {
        return smallDonorTotal;
    }

    public BigDecimal getSmallDonorPct() {
        return smallDonorPct;
    }

    public BigDecimal getInStateTotal() {
        return inStateTotal;
    }

    public BigDecimal getOutOfStateTotal() {
        return outOfStateTotal;
    }

    public BigDecimal getOutOfStatePct() {
        return outOfStatePct;
    }

    public BigDecimal getDcDonorTotal() {
        return dcDonorTotal;
    }

    public String getTopIndustries() {
        return topIndustries;
    }

    public BigDecimal getPolPtyTotal() {
        return polPtyTotal;
    }

    public BigDecimal getPolPtyPct() {
        return polPtyPct;
    }

    public BigDecimal getSelfFundedTotal() {
        return selfFundedTotal;
    }

    public BigDecimal getSelfFundedPct() {
        return selfFundedPct;
    }

    public BigDecimal getOtherTotal() {
        return otherTotal;
    }

    public BigDecimal getOtherPct() {
        return otherPct;
    }

    @Embeddable
    public static class LegislatorFundingSummaryId implements Serializable {

        @Column(name = "bioguide_id")
        private String bioguideId;

        @Column(name = "cycle")
        private Integer cycle;

        protected LegislatorFundingSummaryId() {
        }

        public LegislatorFundingSummaryId(String bioguideId, Integer cycle) {
            this.bioguideId = bioguideId;
            this.cycle = cycle;
        }

        public String getBioguideId() {
            return bioguideId;
        }

        public Integer getCycle() {
            return cycle;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            LegislatorFundingSummaryId that = (LegislatorFundingSummaryId) o;
            return Objects.equals(bioguideId, that.bioguideId)
                    && Objects.equals(cycle, that.cycle);
        }

        @Override
        public int hashCode() {
            return Objects.hash(bioguideId, cycle);
        }
    }
}
