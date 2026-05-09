package com.beyondthevote.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final int maxRequests;
    private final Map<String, RateBucket> buckets = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper;

    public RateLimitInterceptor(
            @Value("${app.rate-limit.requests-per-minute:60}") int maxRequests,
            ObjectMapper objectMapper) {
        this.maxRequests = maxRequests;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws IOException {
        String ip = request.getRemoteAddr();
        RateBucket bucket = buckets.computeIfAbsent(ip, k -> new RateBucket());

        if (!bucket.tryConsume(maxRequests)) {
            response.setStatus(429);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            objectMapper.writeValue(response.getWriter(), Map.of("error", "Rate limit exceeded"));
            return false;
        }

        return true;
    }

    private static class RateBucket {
        private final AtomicInteger count = new AtomicInteger(0);
        private final AtomicLong windowStart = new AtomicLong(System.currentTimeMillis());
        private static final long WINDOW_MS = Duration.ofMinutes(1).toMillis();

        boolean tryConsume(int max) {
            long now = System.currentTimeMillis();
            long start = windowStart.get();
            if (now - start > WINDOW_MS) {
                windowStart.set(now);
                count.set(1);
                return true;
            }
            return count.incrementAndGet() <= max;
        }
    }
}
