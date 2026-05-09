package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;

@Entity
@Immutable
@Table(name = "pac_to_candidate")
public class PacToCandidate {

    @Id
    @Column(name = "sub_id")
    private Long subId;

    @Column(name = "cmte_id", nullable = false)
    private String cmteId;

    @Column(name = "cand_id")
    private String candId;

    @Column(name = "transaction_tp")
    private String transactionTp;

    @Column(name = "transaction_amt", nullable = false, precision = 12, scale = 2)
    private BigDecimal transactionAmt;

    @Column(name = "transaction_dt")
    private String transactionDt;

    @Column(name = "cycle", nullable = false)
    private Short cycle;

    protected PacToCandidate() {
    }

    public Long getSubId() {
        return subId;
    }

    public String getCmteId() {
        return cmteId;
    }

    public String getCandId() {
        return candId;
    }

    public String getTransactionTp() {
        return transactionTp;
    }

    public BigDecimal getTransactionAmt() {
        return transactionAmt;
    }

    public String getTransactionDt() {
        return transactionDt;
    }

    public Short getCycle() {
        return cycle;
    }
}
