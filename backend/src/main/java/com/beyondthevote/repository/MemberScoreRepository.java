package com.beyondthevote.repository;

import com.beyondthevote.entity.MemberScore;
import com.beyondthevote.entity.MemberScoreId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MemberScoreRepository extends JpaRepository<MemberScore, MemberScoreId> {

    List<MemberScore> findByIdBioguideIdOrderByIdCongressDesc(String bioguideId);

    Optional<MemberScore> findFirstByIdBioguideIdOrderByIdCongressDesc(String bioguideId);
}
