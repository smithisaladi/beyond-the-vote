package com.beyondthevote.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "topic_preferences")
public class TopicPreference {

    @EmbeddedId
    private TopicPreferenceId id;

    protected TopicPreference() {
    }

    public TopicPreference(TopicPreferenceId id) {
        this.id = id;
    }

    public static TopicPreference create(UUID userId, String topic) {
        return new TopicPreference(new TopicPreferenceId(userId, topic));
    }

    public TopicPreferenceId getId() {
        return id;
    }

    public void setId(TopicPreferenceId id) {
        this.id = id;
    }

    @Embeddable
    public static class TopicPreferenceId implements Serializable {

        @Column(name = "user_id")
        private UUID userId;

        @Column(name = "topic")
        private String topic;

        protected TopicPreferenceId() {
        }

        public TopicPreferenceId(UUID userId, String topic) {
            this.userId = userId;
            this.topic = topic;
        }

        public UUID getUserId() {
            return userId;
        }

        public String getTopic() {
            return topic;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            TopicPreferenceId that = (TopicPreferenceId) o;
            return Objects.equals(userId, that.userId)
                    && Objects.equals(topic, that.topic);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, topic);
        }
    }
}
