package com.beyondthevote.repository;

import com.beyondthevote.entity.ContributorLeaderboardCache;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;

public interface ContributorLeaderboardCacheRepository extends JpaRepository<ContributorLeaderboardCache, String> {

    @Query("SELECT c FROM ContributorLeaderboardCache c WHERE LOWER(c.cmteName) LIKE LOWER(CONCAT('%', :query, '%')) ORDER BY c.totalContributions DESC")
    Page<ContributorLeaderboardCache> searchByName(@Param("query") String query, Pageable pageable);

    Page<ContributorLeaderboardCache> findAllByOrderByTotalContributionsDesc(Pageable pageable);

    Long countByTotalContributionsGreaterThan(BigDecimal totalContributions);
}
