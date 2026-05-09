package com.beyondthevote.entity;

import io.hypersistence.utils.hibernate.type.json.JsonBinaryType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.Type;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Immutable
@Table(name = "pipeline_runs")
public class PipelineRun {

    @Id
    @Column(name = "id")
    private UUID id;

    @Column(name = "script", nullable = false)
    private String script;

    @Column(name = "phase")
    private String phase;

    @Column(name = "bioguide_id")
    private String bioguideId;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "started_at", nullable = false)
    private OffsetDateTime startedAt;

    @Column(name = "finished_at")
    private OffsetDateTime finishedAt;

    @Type(JsonBinaryType.class)
    @Column(name = "result", columnDefinition = "jsonb")
    private String result;

    @Column(name = "error")
    private String error;

    protected PipelineRun() {
    }

    public UUID getId() {
        return id;
    }

    public String getScript() {
        return script;
    }

    public String getPhase() {
        return phase;
    }

    public String getBioguideId() {
        return bioguideId;
    }

    public String getStatus() {
        return status;
    }

    public OffsetDateTime getStartedAt() {
        return startedAt;
    }

    public OffsetDateTime getFinishedAt() {
        return finishedAt;
    }

    public String getResult() {
        return result;
    }

    public String getError() {
        return error;
    }
}
