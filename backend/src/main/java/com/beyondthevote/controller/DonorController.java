package com.beyondthevote.controller;

import com.beyondthevote.dto.response.DonorDetailResponse;
import com.beyondthevote.dto.response.DonorListResponse;
import com.beyondthevote.service.DonorService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/donors")
public class DonorController {

    private final DonorService donorService;

    public DonorController(DonorService donorService) {
        this.donorService = donorService;
    }

    @GetMapping
    public ResponseEntity<DonorListResponse> listDonors(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "0") int offset
    ) {
        DonorListResponse response = donorService.listDonors(q, limit, offset);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{cmteId}")
    public ResponseEntity<DonorDetailResponse> getPacDetail(
            @PathVariable String cmteId,
            @RequestParam(defaultValue = "0") String summary
    ) {
        boolean includeSummary = "1".equals(summary);
        DonorDetailResponse response = donorService.getPacDetail(cmteId, includeSummary);
        return ResponseEntity.ok(response);
    }
}
