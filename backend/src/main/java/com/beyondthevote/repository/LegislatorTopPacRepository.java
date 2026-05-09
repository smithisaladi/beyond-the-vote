package com.beyondthevote.repository;

import com.beyondthevote.entity.LegislatorTopPac;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface LegislatorTopPacRepository extends JpaRepository<LegislatorTopPac, LegislatorTopPac.LegislatorTopPacId> {

    @Query("SELECT p FROM LegislatorTopPac p WHERE p.id.bioguideId = :bioguideId ORDER BY p.totalSupport DESC")
    List<LegislatorTopPac> findByBioguideId(@Param("bioguideId") String bioguideId);
}
