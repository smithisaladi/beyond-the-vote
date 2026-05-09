package com.beyondthevote.entity;

import io.hypersistence.utils.hibernate.type.array.StringArrayType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Type;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "bills")
public class Bill {

    @Id
    @Column(name = "bill_id", nullable = false)
    private String billId;

    @Column(name = "congress", nullable = false)
    private Integer congress;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "summary")
    private String summary;

    @Column(name = "combined_text")
    private String combinedText;

    @Column(name = "synced_at")
    private OffsetDateTime syncedAt;

    @Type(StringArrayType.class)
    @Column(name = "topics", nullable = false, columnDefinition = "text[]")
    private String[] topics;

    @Column(name = "status")
    private String status;

    @Column(name = "bill_number")
    private String billNumber;

    @Column(name = "sponsor_name")
    private String sponsorName;

    @Column(name = "sponsor_bioguide_id")
    private String sponsorBioguideId;

    @Column(name = "sponsor_party")
    private String sponsorParty;

    @Column(name = "introduced_date")
    private LocalDate introducedDate;

    @Column(name = "policy_area")
    private String policyArea;

    @Column(name = "congress_gov_url")
    private String congressGovUrl;

    @Column(name = "last_action_text")
    private String lastActionText;

    @Column(name = "last_action_date")
    private LocalDate lastActionDate;

    @Column(name = "search_vector", insertable = false, updatable = false)
    private String searchVector;

    @Type(StringArrayType.class)
    @Column(name = "referenced_agencies", columnDefinition = "text[]")
    private String[] referencedAgencies;

    @Type(StringArrayType.class)
    @Column(name = "referenced_laws", columnDefinition = "text[]")
    private String[] referencedLaws;

    @Type(StringArrayType.class)
    @Column(name = "referenced_usc", columnDefinition = "text[]")
    private String[] referencedUsc;

    public Bill() {
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

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public String getCombinedText() {
        return combinedText;
    }

    public void setCombinedText(String combinedText) {
        this.combinedText = combinedText;
    }

    public OffsetDateTime getSyncedAt() {
        return syncedAt;
    }

    public void setSyncedAt(OffsetDateTime syncedAt) {
        this.syncedAt = syncedAt;
    }

    public String[] getTopics() {
        return topics;
    }

    public void setTopics(String[] topics) {
        this.topics = topics;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getBillNumber() {
        return billNumber;
    }

    public void setBillNumber(String billNumber) {
        this.billNumber = billNumber;
    }

    public String getSponsorName() {
        return sponsorName;
    }

    public void setSponsorName(String sponsorName) {
        this.sponsorName = sponsorName;
    }

    public String getSponsorBioguideId() {
        return sponsorBioguideId;
    }

    public void setSponsorBioguideId(String sponsorBioguideId) {
        this.sponsorBioguideId = sponsorBioguideId;
    }

    public String getSponsorParty() {
        return sponsorParty;
    }

    public void setSponsorParty(String sponsorParty) {
        this.sponsorParty = sponsorParty;
    }

    public LocalDate getIntroducedDate() {
        return introducedDate;
    }

    public void setIntroducedDate(LocalDate introducedDate) {
        this.introducedDate = introducedDate;
    }

    public String getPolicyArea() {
        return policyArea;
    }

    public void setPolicyArea(String policyArea) {
        this.policyArea = policyArea;
    }

    public String getCongressGovUrl() {
        return congressGovUrl;
    }

    public void setCongressGovUrl(String congressGovUrl) {
        this.congressGovUrl = congressGovUrl;
    }

    public String getLastActionText() {
        return lastActionText;
    }

    public void setLastActionText(String lastActionText) {
        this.lastActionText = lastActionText;
    }

    public LocalDate getLastActionDate() {
        return lastActionDate;
    }

    public void setLastActionDate(LocalDate lastActionDate) {
        this.lastActionDate = lastActionDate;
    }

    public String getSearchVector() {
        return searchVector;
    }

    public String[] getReferencedAgencies() {
        return referencedAgencies;
    }

    public void setReferencedAgencies(String[] referencedAgencies) {
        this.referencedAgencies = referencedAgencies;
    }

    public String[] getReferencedLaws() {
        return referencedLaws;
    }

    public void setReferencedLaws(String[] referencedLaws) {
        this.referencedLaws = referencedLaws;
    }

    public String[] getReferencedUsc() {
        return referencedUsc;
    }

    public void setReferencedUsc(String[] referencedUsc) {
        this.referencedUsc = referencedUsc;
    }
}
