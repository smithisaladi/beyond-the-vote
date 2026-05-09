package com.beyondthevote.repository;

import com.beyondthevote.entity.BillVoteSummary;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BillVoteSummaryRepository extends JpaRepository<BillVoteSummary, String> {

    List<BillVoteSummary> findByBillIdOrderByDateDesc(String billId);
}
