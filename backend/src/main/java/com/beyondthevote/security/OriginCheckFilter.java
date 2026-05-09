package com.beyondthevote.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * CSRF defense for cookie-authenticated state-changing requests.
 *
 * SameSite=Lax already blocks cross-site form posts, but we add an explicit
 * Origin/Referer check on POST/PUT/PATCH/DELETE as a second line. Same-origin
 * deployments leave allowedOrigins empty; the request's own host is always
 * accepted.
 */
@Component
public class OriginCheckFilter extends OncePerRequestFilter {

    private static final Set<String> STATE_CHANGING = new HashSet<>(Arrays.asList(
            HttpMethod.POST.name(), HttpMethod.PUT.name(),
            HttpMethod.PATCH.name(), HttpMethod.DELETE.name()
    ));

    private final Set<String> allowedOrigins;

    public OriginCheckFilter(@Value("${app.cors.allowed-origins:}") String allowedOriginsCsv) {
        this.allowedOrigins = new HashSet<>();
        if (allowedOriginsCsv != null && !allowedOriginsCsv.isBlank()) {
            for (String s : allowedOriginsCsv.split(",")) {
                String t = s.trim();
                if (!t.isEmpty()) allowedOrigins.add(t);
            }
        }
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {

        if (!STATE_CHANGING.contains(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        String origin = request.getHeader(HttpHeaders.ORIGIN);
        String referer = origin == null ? request.getHeader(HttpHeaders.REFERER) : null;
        String candidate = origin != null ? origin : referer;

        if (candidate == null || isAllowed(request, candidate)) {
            filterChain.doFilter(request, response);
            return;
        }

        response.sendError(HttpServletResponse.SC_FORBIDDEN, "Origin not allowed");
    }

    private boolean isAllowed(HttpServletRequest request, String candidate) {
        String candidateOrigin = toOrigin(candidate);
        if (candidateOrigin == null) return false;
        if (allowedOrigins.contains(candidateOrigin)) return true;
        // Same-origin: scheme://host[:port] of the request itself.
        return candidateOrigin.equals(requestOrigin(request));
    }

    private static String toOrigin(String value) {
        try {
            URI u = new URI(value);
            if (u.getScheme() == null || u.getHost() == null) return null;
            return u.getPort() < 0
                    ? u.getScheme() + "://" + u.getHost()
                    : u.getScheme() + "://" + u.getHost() + ":" + u.getPort();
        } catch (URISyntaxException e) {
            return null;
        }
    }

    private static String requestOrigin(HttpServletRequest request) {
        String scheme = request.getScheme();
        String host = request.getServerName();
        int port = request.getServerPort();
        boolean defaultPort = ("http".equals(scheme) && port == 80) || ("https".equals(scheme) && port == 443);
        return defaultPort ? scheme + "://" + host : scheme + "://" + host + ":" + port;
    }
}
