package com.beyondthevote.repository;

import com.beyondthevote.entity.TopicPreference;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TopicPreferenceRepository extends JpaRepository<TopicPreference, TopicPreference.TopicPreferenceId> {

    List<TopicPreference> findByIdUserId(UUID userId);

    void deleteByIdUserId(UUID userId);
}
