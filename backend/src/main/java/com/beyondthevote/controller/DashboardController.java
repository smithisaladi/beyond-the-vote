package com.beyondthevote.controller;

import com.beyondthevote.service.DashboardService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/followed")
    public ResponseEntity<Map<String, Object>> getFollowed(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(dashboardService.getFollowedPoliticians(userId));
    }

    @GetMapping("/tracked-bills")
    public ResponseEntity<Map<String, Object>> getTrackedBills(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(dashboardService.getTrackedBills(userId));
    }

    @GetMapping("/topic-preferences")
    public ResponseEntity<Map<String, Object>> getTopicPreferences(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(dashboardService.getTopicPreferences(userId));
    }

    @PutMapping("/topic-preferences")
    public ResponseEntity<Map<String, Object>> setTopicPreferences(
            Authentication auth,
            @RequestBody Map<String, List<String>> body) {
        UUID userId = (UUID) auth.getPrincipal();
        List<String> topics = body.getOrDefault("topics", List.of());
        return ResponseEntity.ok(dashboardService.setTopicPreferences(userId, topics));
    }

    @PostMapping("/follow/{politicianId}")
    public ResponseEntity<Void> follow(Authentication auth, @PathVariable String politicianId) {
        UUID userId = (UUID) auth.getPrincipal();
        dashboardService.followPolitician(userId, politicianId);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/follow/{politicianId}")
    public ResponseEntity<Void> unfollow(Authentication auth, @PathVariable String politicianId) {
        UUID userId = (UUID) auth.getPrincipal();
        dashboardService.unfollowPolitician(userId, politicianId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/track/{billId}")
    public ResponseEntity<Void> track(Authentication auth, @PathVariable String billId) {
        UUID userId = (UUID) auth.getPrincipal();
        dashboardService.trackBill(userId, billId);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/track/{billId}")
    public ResponseEntity<Void> untrack(Authentication auth, @PathVariable String billId) {
        UUID userId = (UUID) auth.getPrincipal();
        dashboardService.untrackBill(userId, billId);
        return ResponseEntity.ok().build();
    }
}
