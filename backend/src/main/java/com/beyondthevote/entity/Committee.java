package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "committees")
public class Committee {

    @Id
    @Column(name = "thomas_id", nullable = false)
    private String thomasId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "chamber", nullable = false)
    private String chamber;

    @Column(name = "url")
    private String url;

    @Column(name = "parent_id")
    private String parentId;

    public Committee() {
    }

    public String getThomasId() {
        return thomasId;
    }

    public void setThomasId(String thomasId) {
        this.thomasId = thomasId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getChamber() {
        return chamber;
    }

    public void setChamber(String chamber) {
        this.chamber = chamber;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getParentId() {
        return parentId;
    }

    public void setParentId(String parentId) {
        this.parentId = parentId;
    }
}
