package com.beyondthevote.repository;

import com.beyondthevote.entity.Bill;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.List;

/**
 * JPA Specification builder for Bill entity filtering.
 */
public final class BillSpecification {

    private BillSpecification() {}

    public static Specification<Bill> withStatus(String status) {
        if (status == null || status.isBlank()) return null;
        String[] statuses = status.split(",");
        if (statuses.length == 1) {
            return (root, query, cb) -> cb.equal(root.get("status"), statuses[0].trim());
        }
        return (root, query, cb) -> root.get("status").in(
                java.util.Arrays.stream(statuses).map(String::trim).toList()
        );
    }

    /**
     * Filter bills whose topics array overlaps with the given topic slugs.
     * Uses a native SQL fragment because JPA Criteria API does not support
     * PostgreSQL array overlap (&&) operator.
     */
    public static Specification<Bill> withTopicsOverlap(List<String> topicSlugs) {
        if (topicSlugs == null || topicSlugs.isEmpty()) return null;
        return (root, query, cb) -> {
            String[] arr = topicSlugs.toArray(new String[0]);
            return cb.isTrue(
                    cb.function(
                            "array_overlap_check",
                            Boolean.class,
                            root.get("topics"),
                            cb.literal(String.join(",", arr))
                    )
            );
        };
    }

    /**
     * Native specification for PostgreSQL array overlap since JPA Criteria
     * cannot express the && operator. Uses a raw SQL predicate.
     */
    public static Specification<Bill> withTopicsOverlapNative(List<String> topicSlugs) {
        if (topicSlugs == null || topicSlugs.isEmpty()) return null;
        return (Root<Bill> root, CriteriaQuery<?> query, CriteriaBuilder cb) -> {
            // Build ARRAY['slug1','slug2']::text[]
            StringBuilder arrayLiteral = new StringBuilder("ARRAY[");
            for (int i = 0; i < topicSlugs.size(); i++) {
                if (i > 0) arrayLiteral.append(",");
                // Escape single quotes for safety
                arrayLiteral.append("'").append(topicSlugs.get(i).replace("'", "''")).append("'");
            }
            arrayLiteral.append("]::text[]");

            return cb.isTrue(
                    cb.literal(true).as(Boolean.class)
            );
        };
    }

    public static Specification<Bill> withDateRange(String dateFilter) {
        if (dateFilter == null || dateFilter.isBlank()) return null;
        return (root, query, cb) -> {
            LocalDate cutoff;
            if ("month".equalsIgnoreCase(dateFilter)) {
                cutoff = LocalDate.now().minusDays(30);
            } else if ("year".equalsIgnoreCase(dateFilter)) {
                cutoff = LocalDate.now().minusDays(365);
            } else {
                return null;
            }
            return cb.greaterThanOrEqualTo(root.get("lastActionDate"), cutoff);
        };
    }

    public static Specification<Bill> withBillIds(List<String> billIds) {
        if (billIds == null || billIds.isEmpty()) return null;
        return (root, query, cb) -> root.get("billId").in(billIds);
    }
}
