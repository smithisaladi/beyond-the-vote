package com.beyondthevote.controller;

import com.beyondthevote.dto.response.RepresentativeResponse;
import com.beyondthevote.service.RepresentativeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/representatives")
public class RepresentativeController {

    private final RepresentativeService representativeService;

    public RepresentativeController(RepresentativeService representativeService) {
        this.representativeService = representativeService;
    }

    /**
     * GET /api/representatives?address=... — find representatives by address.
     */
    @GetMapping
    public ResponseEntity<RepresentativeResponse> findRepresentatives(@RequestParam String address) {
        if (address == null || address.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(representativeService.findByAddress(address));
    }
}
