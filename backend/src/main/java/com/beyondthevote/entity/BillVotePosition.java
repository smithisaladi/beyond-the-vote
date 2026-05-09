package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "bill_vote_positions")
public class BillVotePosition {

    @EmbeddedId
    private BillVotePositionId id;

    @Column(name = "position", nullable = false)
    private String position;

    public BillVotePosition() {
    }

    public BillVotePositionId getId() {
        return id;
    }

    public void setId(BillVotePositionId id) {
        this.id = id;
    }

    public String getPosition() {
        return position;
    }

    public void setPosition(String position) {
        this.position = position;
    }
}
