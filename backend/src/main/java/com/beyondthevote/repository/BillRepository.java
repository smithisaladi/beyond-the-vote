package com.beyondthevote.repository;

import com.beyondthevote.entity.Bill;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BillRepository extends JpaRepository<Bill, String>, JpaSpecificationExecutor<Bill> {

    @Query(value = "SELECT * FROM bills WHERE topics @> ARRAY[:topic]::text[] ORDER BY synced_at DESC LIMIT :limit OFFSET :offset",
            nativeQuery = true)
    List<Bill> findByTopic(@Param("topic") String topic,
                           @Param("limit") int limit,
                           @Param("offset") int offset);

    @Query(value = "SELECT COUNT(*) FROM bills WHERE topics @> ARRAY[:topic]::text[]",
            nativeQuery = true)
    long countByTopic(@Param("topic") String topic);

    List<Bill> findByBillIdIn(List<String> billIds);

    Page<Bill> findBySponsorBioguideId(String sponsorBioguideId, Pageable pageable);
}
