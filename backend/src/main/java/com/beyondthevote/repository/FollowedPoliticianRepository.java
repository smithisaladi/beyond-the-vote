package com.beyondthevote.repository;

import com.beyondthevote.entity.FollowedPolitician;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface FollowedPoliticianRepository extends JpaRepository<FollowedPolitician, FollowedPolitician.FollowedPoliticianId> {

    List<FollowedPolitician> findByIdUserId(UUID userId);

    void deleteByIdUserIdAndIdPoliticianId(UUID userId, String politicianId);

    boolean existsByIdUserIdAndIdPoliticianId(UUID userId, String politicianId);
}
