package com.beyondthevote.repository;

import com.beyondthevote.entity.TrackedBill;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TrackedBillRepository extends JpaRepository<TrackedBill, TrackedBill.TrackedBillId> {

    List<TrackedBill> findByIdUserId(UUID userId);

    void deleteByIdUserIdAndIdBillId(UUID userId, String billId);

    boolean existsByIdUserIdAndIdBillId(UUID userId, String billId);
}
