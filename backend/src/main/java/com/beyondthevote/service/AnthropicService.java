package com.beyondthevote.service;

import com.beyondthevote.dto.response.DonorDetailResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Service
public class AnthropicService {

    private static final Logger log = LoggerFactory.getLogger(AnthropicService.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${app.anthropic.api-key}")
    private String apiKey;

    @Value("${app.anthropic.model}")
    private String model;

    public AnthropicService(ObjectMapper objectMapper) {
        this.restTemplate = new RestTemplate();
        this.objectMapper = objectMapper;
    }

    @Cacheable(value = "pacSummaries", key = "#cmteId", cacheManager = "pacSummaryCacheManager")
    public String generatePacSummary(
            String cmteId,
            String pacName,
            String connectedOrg,
            BigDecimal totalContributions,
            BigDecimal directTotal,
            BigDecimal ieForTotal,
            BigDecimal ieAgainstTotal,
            long recipientCount,
            List<DonorDetailResponse.RecipientDto> recipients
    ) {
        if (apiKey == null || apiKey.isBlank()) {
            return "";
        }

        try {
            List<DonorDetailResponse.RecipientDto> topRecipients = recipients.stream()
                    .limit(10)
                    .toList();

            long demCount = recipients.stream().filter(r -> "Democrat".equals(r.party())).count();
            long repCount = recipients.stream().filter(r -> "Republican".equals(r.party())).count();
            long indCount = recipients.size() - demCount - repCount;

            StringBuilder spendingBreakdown = new StringBuilder();
            if (directTotal.signum() > 0) {
                spendingBreakdown.append("$").append(formatNumber(directTotal))
                        .append(" in direct contributions to campaigns");
            }
            if (ieForTotal.signum() > 0) {
                if (!spendingBreakdown.isEmpty()) spendingBreakdown.append("; ");
                spendingBreakdown.append("$").append(formatNumber(ieForTotal))
                        .append(" in independent expenditures supporting candidates");
            }
            if (ieAgainstTotal.signum() > 0) {
                if (!spendingBreakdown.isEmpty()) spendingBreakdown.append("; ");
                spendingBreakdown.append("$").append(formatNumber(ieAgainstTotal))
                        .append(" in independent expenditures opposing candidates");
            }

            String topRecipientsStr = topRecipients.stream()
                    .map(r -> "%s (%s, %s): $%s".formatted(r.name(), r.party(), r.state(), formatNumber(r.amount())))
                    .reduce((a, b) -> a + "; " + b)
                    .orElse("N/A");

            String prompt = """
                    You are a knowledgeable, neutral political analyst. Given the following FEC data about a Political Action Committee (PAC), write an informative analysis in two short paragraphs.

                    **Paragraph 1 — Background:** Using your own knowledge, describe what this organization is, what industry or cause it represents, and any notable context about its role in politics. If you don't recognize the PAC, describe it based on the name and connected organization.

                    **Paragraph 2 — Spending analysis:** Summarize the FEC spending data provided below. Note the total amount, how spending breaks down between direct contributions and independent expenditures, and how it is distributed across parties and top recipients.

                    Rules:
                    - Be informative and direct. Avoid filler phrases like "based on the data provided."
                    - Accurately distinguish between direct contributions and independent expenditures.
                    - You may note partisan patterns (e.g. "overwhelmingly supports Republican candidates") when the data clearly shows it — just state the facts without editorializing about motives.
                    - Keep each paragraph to 2-3 sentences. Separate paragraphs with a blank line.

                    PAC Name: %s
                    %sTotal spending: $%s
                    Spending breakdown: %s
                    Number of candidates supported: %d
                    Party breakdown of recipients: %d Democrats, %d Republicans, %d Independent
                    Top recipients: %s

                    Write only the two paragraphs, no headings or labels.""".formatted(
                    pacName,
                    connectedOrg != null ? "Connected Organization: " + connectedOrg + "\n" : "",
                    formatNumber(totalContributions),
                    spendingBreakdown.isEmpty() ? "N/A" : spendingBreakdown.toString(),
                    recipientCount,
                    demCount, repCount, indCount,
                    topRecipientsStr
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("x-api-key", apiKey);
            headers.set("anthropic-version", "2023-06-01");

            Map<String, Object> requestBody = Map.of(
                    "model", model,
                    "max_tokens", 400,
                    "messages", List.of(Map.of("role", "user", "content", prompt))
            );

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            ResponseEntity<String> response = restTemplate.exchange(
                    "https://api.anthropic.com/v1/messages",
                    HttpMethod.POST,
                    entity,
                    String.class
            );

            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode content = root.get("content");
            if (content != null && content.isArray() && !content.isEmpty()) {
                JsonNode firstBlock = content.get(0);
                if ("text".equals(firstBlock.get("type").asText())) {
                    return firstBlock.get("text").asText();
                }
            }
            return "";
        } catch (Exception e) {
            log.error("[AnthropicService] AI summary generation failed for {}", cmteId, e);
            return "";
        }
    }

    private String formatNumber(BigDecimal value) {
        return String.format("%,.0f", value);
    }
}
