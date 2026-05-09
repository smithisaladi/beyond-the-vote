package com.beyondthevote.service;

import com.beyondthevote.dto.response.RepresentativeResponse;
import com.beyondthevote.dto.response.RepresentativeResponse.Representative;
import com.beyondthevote.entity.Legislator;
import com.beyondthevote.entity.MemberScore;
import com.beyondthevote.repository.LegislatorRepository;
import com.beyondthevote.repository.MemberScoreRepository;
import com.beyondthevote.service.CongressApiService.CongressMember;
import com.beyondthevote.service.CongressApiService.CongressTerm;
import com.beyondthevote.service.GeocodioService.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class RepresentativeService {

    private static final Logger log = LoggerFactory.getLogger(RepresentativeService.class);

    private final GeocodioService geocodioService;
    private final LegislatorRepository legislatorRepository;
    private final MemberScoreRepository memberScoreRepository;
    private final CongressApiService congressApiService;

    public RepresentativeService(
            GeocodioService geocodioService,
            LegislatorRepository legislatorRepository,
            MemberScoreRepository memberScoreRepository,
            CongressApiService congressApiService) {
        this.geocodioService = geocodioService;
        this.legislatorRepository = legislatorRepository;
        this.memberScoreRepository = memberScoreRepository;
        this.congressApiService = congressApiService;
    }

    /**
     * Find representatives by address using Geocodio for district lookup,
     * then enrich with local DB data and Congress.gov API.
     */
    public RepresentativeResponse findByAddress(String address) {
        GeocodioResult result = geocodioService.geocode(address);
        if (result == null) {
            throw new IllegalArgumentException("address_not_found");
        }

        String stateCode = result.addressComponents != null ? result.addressComponents.state : null;
        if (stateCode == null || stateCode.isBlank()) {
            throw new IllegalArgumentException("address_not_found");
        }

        List<CongressionalDistrict> districts = result.fields != null
                && result.fields.congressionalDistricts != null
                ? result.fields.congressionalDistricts
                : Collections.emptyList();

        // Collect all unique legislators from Geocodio response
        Set<String> seen = new LinkedHashSet<>();
        List<LegislatorInfo> legislatorInfos = new ArrayList<>();

        for (CongressionalDistrict district : districts) {
            if (district.currentLegislators == null) continue;
            for (GeocodioLegislator leg : district.currentLegislators) {
                String key = leg.references != null && leg.references.bioguideId != null
                        ? leg.references.bioguideId
                        : (leg.bio != null ? leg.bio.lastName + "-" + leg.type : UUID.randomUUID().toString());
                if (seen.add(key)) {
                    legislatorInfos.add(new LegislatorInfo(leg, district.districtNumber != null ? district.districtNumber : 0));
                }
            }
        }

        if (legislatorInfos.isEmpty()) {
            throw new IllegalArgumentException("no_legislators");
        }

        // Collect bioguide IDs for batch DB lookups
        List<String> bioguideIds = legislatorInfos.stream()
                .map(li -> li.leg.references != null ? li.leg.references.bioguideId : null)
                .filter(Objects::nonNull)
                .toList();

        // Batch fetch local data: photos
        Map<String, Legislator> localDataMap = new HashMap<>();
        if (!bioguideIds.isEmpty()) {
            for (String id : bioguideIds) {
                legislatorRepository.findById(id).ifPresent(l -> localDataMap.put(id, l));
            }
        }

        // Batch fetch ideology scores
        Map<String, Double> ideologyMap = new HashMap<>();
        for (String id : bioguideIds) {
            memberScoreRepository.findFirstByIdBioguideIdOrderByIdCongressDesc(id)
                    .ifPresent(s -> {
                        if (s.getNominateDim1() != null) {
                            ideologyMap.put(id, s.getNominateDim1().doubleValue());
                        }
                    });
        }

        // Build representatives
        List<Representative> representatives = legislatorInfos.stream()
                .map(li -> {
                    GeocodioLegislator leg = li.leg;
                    String bioguideId = leg.references != null ? leg.references.bioguideId : null;

                    String firstName = leg.bio != null && leg.bio.firstName != null ? leg.bio.firstName : "";
                    String lastName = leg.bio != null && leg.bio.lastName != null ? leg.bio.lastName : "";
                    String name = (firstName + " " + lastName).trim();
                    boolean isSenator = "senator".equalsIgnoreCase(leg.type);

                    // Enrich from Congress.gov for since/website
                    String since = null;
                    String website = null;
                    if (bioguideId != null && !bioguideId.isBlank()) {
                        CongressMember member = congressApiService.fetchMember(bioguideId);
                        if (member != null) {
                            CongressTerm firstTerm = member.getFirstTerm();
                            if (firstTerm != null && firstTerm.startYear != null) {
                                since = firstTerm.startYear.toString();
                            }
                            if (member.officialWebsiteUrl != null) {
                                website = member.officialWebsiteUrl;
                            }
                        }
                    }

                    if (website == null && leg.contact != null) {
                        website = leg.contact.url;
                    }

                    Legislator localData = bioguideId != null ? localDataMap.get(bioguideId) : null;
                    String photo = localData != null ? localData.getPhotoUrl() : null;

                    String id = bioguideId != null && !bioguideId.isBlank()
                            ? bioguideId
                            : name.replaceAll("\\s+", "-").toLowerCase();

                    String party = GeocodioService.normalizeParty(
                            leg.bio != null ? leg.bio.party : null);

                    return new Representative(
                            id,
                            bioguideId,
                            name,
                            isSenator ? "U.S. Senator" : "U.S. Representative",
                            party,
                            stateCode,
                            !isSenator ? ordinal(li.districtNumber) : null,
                            photo,
                            since,
                            website,
                            leg.contact != null ? leg.contact.phone : null,
                            bioguideId != null ? ideologyMap.get(bioguideId) : null
                    );
                })
                .toList();

        return new RepresentativeResponse(representatives);
    }

    private static String ordinal(int n) {
        if (n >= 11 && n <= 13) return n + "th";
        return switch (n % 10) {
            case 1 -> n + "st";
            case 2 -> n + "nd";
            case 3 -> n + "rd";
            default -> n + "th";
        };
    }

    private record LegislatorInfo(GeocodioLegislator leg, int districtNumber) {}
}
