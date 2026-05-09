package com.beyondthevote.controller;

import com.beyondthevote.dto.response.PoliticianDetailResponse;
import com.beyondthevote.dto.response.PoliticianSearchResponse;
import com.beyondthevote.service.PoliticianService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/politicians")
public class PoliticianController {

    private final PoliticianService politicianService;

    public PoliticianController(PoliticianService politicianService) {
        this.politicianService = politicianService;
    }

    /**
     * GET /api/politicians/{id} — full politician profile with tiered data assembly.
     */
    @GetMapping("/{id}")
    public ResponseEntity<PoliticianDetailResponse> getPolitician(@PathVariable String id) {
        return ResponseEntity.ok(politicianService.getPoliticianDetail(id));
    }

    /**
     * GET /api/politicians/search?q=... — search politicians by name.
     */
    @GetMapping("/search")
    public ResponseEntity<PoliticianSearchResponse> searchPoliticians(@RequestParam String q) {
        if (q == null || q.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(politicianService.searchPoliticians(q));
    }
}
