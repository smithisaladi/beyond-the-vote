package com.beyondthevote.repository;

import com.beyondthevote.entity.LegislatorFundingSummary;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface LegislatorFundingSummaryRepository extends JpaRepository<LegislatorFundingSummary, LegislatorFundingSummary.LegislatorFundingSummaryId> {

    @Query("SELECT s FROM LegislatorFundingSummary s WHERE s.id.bioguideId = :bioguideId ORDER BY s.id.cycle DESC")
    List<LegislatorFundingSummary> findByBioguideId(@Param("bioguideId") String bioguideId);
}
