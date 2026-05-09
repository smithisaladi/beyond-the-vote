package com.beyondthevote.repository;

import com.beyondthevote.entity.BillVotePosition;
import com.beyondthevote.entity.BillVotePositionId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BillVotePositionRepository extends JpaRepository<BillVotePosition, BillVotePositionId> {

    List<BillVotePosition> findByIdVoteId(String voteId);

    @Query("SELECT p FROM BillVotePosition p WHERE p.id.bioguideId = :bioguideId")
    List<BillVotePosition> findByBioguideId(@Param("bioguideId") String bioguideId);
}
