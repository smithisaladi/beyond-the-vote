package com.beyondthevote.repository;

import com.beyondthevote.entity.LegislatorTopContributor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface LegislatorTopContributorRepository extends JpaRepository<LegislatorTopContributor, LegislatorTopContributor.LegislatorTopContributorId> {

    @Query("SELECT c FROM LegislatorTopContributor c WHERE c.id.bioguideId = :bioguideId ORDER BY c.grandTotal DESC")
    List<LegislatorTopContributor> findByBioguideId(@Param("bioguideId") String bioguideId);
}
