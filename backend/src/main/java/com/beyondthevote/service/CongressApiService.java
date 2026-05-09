package com.beyondthevote.service;

import com.beyondthevote.dto.response.PoliticianDetailResponse.BillDto;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class CongressApiService {

    private static final Logger log = LoggerFactory.getLogger(CongressApiService.class);

    private final RestTemplate restTemplate;
    private final String apiKey;
    private final String baseUrl;

    public CongressApiService(
            RestTemplate restTemplate,
            @Value("${app.congress-api.key:}") String apiKey,
            @Value("${app.congress-api.base-url:https://api.congress.gov/v3}") String baseUrl) {
        this.restTemplate = restTemplate;
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    /**
     * Fetch sponsored bills for a legislator from the Congress.gov v3 API.
     */
    @Cacheable(value = "sponsoredBills", key = "#bioguideId")
    public List<BillDto> fetchSponsoredBills(String bioguideId) {
        if (apiKey == null || apiKey.isBlank()) {
            log.warn("Congress API key not configured, skipping sponsored bills fetch");
            return Collections.emptyList();
        }

        String url = UriComponentsBuilder.fromHttpUrl(baseUrl + "/member/{bioguideId}/sponsored-legislation")
                .queryParam("format", "json")
                .queryParam("limit", 20)
                .queryParam("api_key", apiKey)
                .buildAndExpand(bioguideId)
                .toUriString();

        try {
            CongressSponsoredResponse response = restTemplate.getForObject(url, CongressSponsoredResponse.class);
            if (response == null || response.sponsoredLegislation == null) {
                return Collections.emptyList();
            }

            return response.sponsoredLegislation.stream()
                    .map(bill -> new BillDto(
                            buildBillId(bill),
                            buildBillNumber(bill),
                            bill.title,
                            bill.introducedDate,
                            mapLatestActionToStatus(bill.latestAction),
                            bill.url
                    ))
                    .collect(Collectors.toList());
        } catch (RestClientException e) {
            log.error("Congress API call failed for sponsored bills of {}", bioguideId, e);
            return Collections.emptyList();
        }
    }

    /**
     * Fetch member details from Congress.gov for enrichment (since year, website).
     */
    @Cacheable(value = "congressMember", key = "#bioguideId")
    public CongressMember fetchMember(String bioguideId) {
        if (apiKey == null || apiKey.isBlank()) {
            return null;
        }

        String url = UriComponentsBuilder.fromHttpUrl(baseUrl + "/member/{bioguideId}")
                .queryParam("format", "json")
                .queryParam("api_key", apiKey)
                .buildAndExpand(bioguideId)
                .toUriString();

        try {
            CongressMemberResponse response = restTemplate.getForObject(url, CongressMemberResponse.class);
            return response != null ? response.member : null;
        } catch (RestClientException e) {
            log.error("Congress API call failed for member {}", bioguideId, e);
            return null;
        }
    }

    private String buildBillId(CongressBill bill) {
        if (bill.type != null && bill.number != null && bill.congress != null) {
            return bill.type.toLowerCase() + bill.number + "-" + bill.congress;
        }
        return null;
    }

    private String buildBillNumber(CongressBill bill) {
        if (bill.type != null && bill.number != null) {
            String prefix = switch (bill.type.toUpperCase()) {
                case "HR" -> "H.R.";
                case "S" -> "S.";
                case "HRES" -> "H.Res.";
                case "SRES" -> "S.Res.";
                case "HJRES" -> "H.J.Res.";
                case "SJRES" -> "S.J.Res.";
                case "HCONRES" -> "H.Con.Res.";
                case "SCONRES" -> "S.Con.Res.";
                default -> bill.type + ".";
            };
            return prefix + " " + bill.number;
        }
        return null;
    }

    private String mapLatestActionToStatus(CongressLatestAction action) {
        if (action == null || action.text == null) return "Introduced";
        String text = action.text.toLowerCase();
        if (text.contains("became public law") || text.contains("signed by president")) return "Passed";
        if (text.contains("passed") && text.contains("agreed")) return "Passed";
        if (text.contains("committee")) return "Committee";
        return "Introduced";
    }

    // ── Congress.gov API response types ─────────────────────────────────────────

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CongressMemberResponse {
        public CongressMember member;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CongressMember {
        public String directOrderName;
        public CongressTerms terms;
        public List<CongressPartyHistory> partyHistory;
        public CongressDepiction depiction;
        public Boolean currentMember;
        public String state;
        public Integer district;
        public CongressAddress addressInformation;
        public String officialWebsiteUrl;

        public CongressTerm getFirstTerm() {
            if (terms != null && terms.item != null && !terms.item.isEmpty()) {
                return terms.item.get(0);
            }
            return null;
        }

        public CongressTerm getLatestTerm() {
            if (terms != null && terms.item != null && !terms.item.isEmpty()) {
                return terms.item.get(terms.item.size() - 1);
            }
            return null;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CongressTerms {
        public List<CongressTerm> item;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CongressTerm {
        public String chamber;
        public String party;
        public Integer startYear;
        public Integer endYear;
        public String stateCode;
        public String stateName;
        public Integer district;
        public String memberType;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CongressPartyHistory {
        public String partyName;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CongressDepiction {
        public String imageUrl;
        public String attribution;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CongressAddress {
        public String officeAddress;
        public String phoneNumber;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CongressSponsoredResponse {
        public List<CongressBill> sponsoredLegislation;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CongressBill {
        public String type;
        public Integer number;
        public Integer congress;
        public String title;
        public String introducedDate;
        public String url;
        public CongressLatestAction latestAction;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CongressLatestAction {
        public String text;
        public String actionDate;
    }
}
