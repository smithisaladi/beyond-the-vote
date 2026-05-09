package com.beyondthevote.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Collections;
import java.util.List;

@Service
public class GeocodioService {

    private static final Logger log = LoggerFactory.getLogger(GeocodioService.class);

    private final RestTemplate restTemplate;
    private final String apiKey;
    private final String baseUrl;

    public GeocodioService(
            RestTemplate restTemplate,
            @Value("${app.geocodio.key:}") String apiKey,
            @Value("${app.geocodio.base-url:https://api.geocod.io/v1.7}") String baseUrl) {
        this.restTemplate = restTemplate;
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    /**
     * Geocode an address and return congressional district info.
     *
     * @param address the street address to geocode
     * @return the geocode result containing state and district info, or null if not found
     */
    public GeocodioResult geocode(String address) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("Geocodio API key is not configured");
        }

        String url = UriComponentsBuilder.fromHttpUrl(baseUrl + "/geocode")
                .queryParam("q", address)
                .queryParam("fields", "cd")
                .queryParam("api_key", apiKey)
                .toUriString();

        try {
            GeocodioResponse response = restTemplate.getForObject(url, GeocodioResponse.class);
            if (response == null || response.results == null || response.results.isEmpty()) {
                return null;
            }
            return response.results.get(0);
        } catch (RestClientException e) {
            log.error("Geocodio API call failed for address: {}", address, e);
            return null;
        }
    }

    // ── Response types ──────────────────────────────────────────────────────────

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GeocodioResponse {
        public List<GeocodioResult> results;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GeocodioResult {
        @JsonProperty("address_components")
        public AddressComponents addressComponents;
        public GeocodioFields fields;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class AddressComponents {
        public String state;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GeocodioFields {
        @JsonProperty("congressional_districts")
        public List<CongressionalDistrict> congressionalDistricts;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CongressionalDistrict {
        @JsonProperty("district_number")
        public Integer districtNumber;

        @JsonProperty("current_legislators")
        public List<GeocodioLegislator> currentLegislators;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GeocodioLegislator {
        public String type;
        public GeocodioBio bio;
        public GeocodioContact contact;
        public GeocodioReferences references;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GeocodioBio {
        @JsonProperty("first_name")
        public String firstName;
        @JsonProperty("last_name")
        public String lastName;
        public String party;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GeocodioContact {
        public String url;
        public String phone;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GeocodioReferences {
        @JsonProperty("bioguide_id")
        public String bioguideId;
    }

    /**
     * Normalize a party string to one of Democrat, Republican, Independent.
     */
    public static String normalizeParty(String party) {
        if (party == null) return "Independent";
        String lower = party.toLowerCase();
        if (lower.contains("democrat")) return "Democrat";
        if (lower.contains("republican")) return "Republican";
        return "Independent";
    }
}
