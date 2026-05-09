package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

@Entity
@Immutable
@Table(name = "fec_cmte_names")
public class FecCmteName {

    @Id
    @Column(name = "cmte_id")
    private String cmteId;

    @Column(name = "cmte_name", nullable = false)
    private String cmteName;

    @Column(name = "connected_org")
    private String connectedOrg;

    protected FecCmteName() {
    }

    public String getCmteId() {
        return cmteId;
    }

    public String getCmteName() {
        return cmteName;
    }

    public String getConnectedOrg() {
        return connectedOrg;
    }
}
