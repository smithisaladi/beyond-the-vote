package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "bill_vote_summaries")
public class BillVoteSummary {

    @Id
    @Column(name = "id", nullable = false)
    private String id;

    @Column(name = "bill_id", nullable = false)
    private String billId;

    @Column(name = "congress", nullable = false)
    private Integer congress;

    @Column(name = "chamber", nullable = false)
    private String chamber;

    @Column(name = "date", nullable = false)
    private LocalDate date;

    @Column(name = "question")
    private String question;

    @Column(name = "result", nullable = false)
    private String result;

    @Column(name = "required")
    private String required;

    @Column(name = "yea_total", nullable = false)
    private Integer yeaTotal;

    @Column(name = "nay_total", nullable = false)
    private Integer nayTotal;

    @Column(name = "present_total")
    private Integer presentTotal;

    @Column(name = "not_voting_total")
    private Integer notVotingTotal;

    @Column(name = "yea_democrat")
    private Integer yeaDemocrat;

    @Column(name = "nay_democrat")
    private Integer nayDemocrat;

    @Column(name = "yea_republican")
    private Integer yeaRepublican;

    @Column(name = "nay_republican")
    private Integer nayRepublican;

    @Column(name = "yea_independent")
    private Integer yeaIndependent;

    @Column(name = "nay_independent")
    private Integer nayIndependent;

    @Column(name = "source_url")
    private String sourceUrl;

    @Column(name = "synced_at")
    private OffsetDateTime syncedAt;

    @Column(name = "title")
    private String title;

    public BillVoteSummary() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getBillId() {
        return billId;
    }

    public void setBillId(String billId) {
        this.billId = billId;
    }

    public Integer getCongress() {
        return congress;
    }

    public void setCongress(Integer congress) {
        this.congress = congress;
    }

    public String getChamber() {
        return chamber;
    }

    public void setChamber(String chamber) {
        this.chamber = chamber;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public String getQuestion() {
        return question;
    }

    public void setQuestion(String question) {
        this.question = question;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String result) {
        this.result = result;
    }

    public String getRequired() {
        return required;
    }

    public void setRequired(String required) {
        this.required = required;
    }

    public Integer getYeaTotal() {
        return yeaTotal;
    }

    public void setYeaTotal(Integer yeaTotal) {
        this.yeaTotal = yeaTotal;
    }

    public Integer getNayTotal() {
        return nayTotal;
    }

    public void setNayTotal(Integer nayTotal) {
        this.nayTotal = nayTotal;
    }

    public Integer getPresentTotal() {
        return presentTotal;
    }

    public void setPresentTotal(Integer presentTotal) {
        this.presentTotal = presentTotal;
    }

    public Integer getNotVotingTotal() {
        return notVotingTotal;
    }

    public void setNotVotingTotal(Integer notVotingTotal) {
        this.notVotingTotal = notVotingTotal;
    }

    public Integer getYeaDemocrat() {
        return yeaDemocrat;
    }

    public void setYeaDemocrat(Integer yeaDemocrat) {
        this.yeaDemocrat = yeaDemocrat;
    }

    public Integer getNayDemocrat() {
        return nayDemocrat;
    }

    public void setNayDemocrat(Integer nayDemocrat) {
        this.nayDemocrat = nayDemocrat;
    }

    public Integer getYeaRepublican() {
        return yeaRepublican;
    }

    public void setYeaRepublican(Integer yeaRepublican) {
        this.yeaRepublican = yeaRepublican;
    }

    public Integer getNayRepublican() {
        return nayRepublican;
    }

    public void setNayRepublican(Integer nayRepublican) {
        this.nayRepublican = nayRepublican;
    }

    public Integer getYeaIndependent() {
        return yeaIndependent;
    }

    public void setYeaIndependent(Integer yeaIndependent) {
        this.yeaIndependent = yeaIndependent;
    }

    public Integer getNayIndependent() {
        return nayIndependent;
    }

    public void setNayIndependent(Integer nayIndependent) {
        this.nayIndependent = nayIndependent;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }

    public OffsetDateTime getSyncedAt() {
        return syncedAt;
    }

    public void setSyncedAt(OffsetDateTime syncedAt) {
        this.syncedAt = syncedAt;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }
}
