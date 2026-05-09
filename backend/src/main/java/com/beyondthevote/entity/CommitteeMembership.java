package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "committee_memberships")
public class CommitteeMembership {

    @EmbeddedId
    private CommitteeMembershipId id;

    @Column(name = "title")
    private String title;

    public CommitteeMembership() {
    }

    public CommitteeMembershipId getId() {
        return id;
    }

    public void setId(CommitteeMembershipId id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }
}
