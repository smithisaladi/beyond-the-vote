package com.beyondthevote.repository;

import com.beyondthevote.entity.Legislator;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface LegislatorRepository extends JpaRepository<Legislator, String> {

    @Query("SELECT l FROM Legislator l WHERE LOWER(l.fullName) LIKE LOWER(CONCAT('%', :query, '%')) AND l.inOffice = true ORDER BY l.fullName")
    List<Legislator> searchByName(@Param("query") String query);

    List<Legislator> findByStateAndChamber(String state, String chamber);

    List<Legislator> findByStateAndChamberAndDistrict(String state, String chamber, Integer district);

    Optional<Legislator> findByLisId(String lisId);

    @Query(value = "SELECT * FROM legislators WHERE fec_ids @> ARRAY[:fecId]::text[]", nativeQuery = true)
    Optional<Legislator> findByFecId(@Param("fecId") String fecId);

    List<Legislator> findByInOfficeTrue();
}
