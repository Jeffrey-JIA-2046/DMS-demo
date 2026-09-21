package com.dms.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class LoginQuotaFilter extends OncePerRequestFilter {

    private static final String LOGIN_ENDPOINT = "/api/me";

    private final boolean enabled;
    private final int maxRequests;
    private final int windowSeconds;
    private final ConcurrentHashMap<String, Deque<Long>> buckets = new ConcurrentHashMap<>();

    public LoginQuotaFilter(
        @Value("${app.security.login-quota.enabled:false}") boolean enabled,
        @Value("${app.security.login-quota.max-requests:3}") int maxRequests,
        @Value("${app.security.login-quota.window-seconds:60}") int windowSeconds
    ) {
        this.enabled = enabled;
        this.maxRequests = maxRequests;
        this.windowSeconds = windowSeconds;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
        throws ServletException, IOException {
        filterChain.doFilter(request, response);
    }

    private boolean isLoginRequest(HttpServletRequest request) {
        return LOGIN_ENDPOINT.equals(request.getRequestURI());
    }

    private String resolveIdentity(HttpServletRequest request) {
        String username = extractBasicAuthUsername(request.getHeader("Authorization"));
        if (!username.isBlank()) {
            return "user:" + username;
        }

        String forwardedFor = trimToEmpty(request.getHeader("X-Forwarded-For"));
        if (!forwardedFor.isBlank()) {
            String first = forwardedFor.split(",")[0].trim();
            if (!first.isBlank()) {
                return "ip:" + first;
            }
        }

        String remote = trimToEmpty(request.getRemoteAddr());
        return remote.isBlank() ? "ip:unknown" : "ip:" + remote;
    }

    private String extractBasicAuthUsername(String authorizationHeader) {
        String header = trimToEmpty(authorizationHeader);
        if (!header.regionMatches(true, 0, "Basic ", 0, 6)) {
            return "";
        }

        String token = header.substring(6).trim();
        if (token.isBlank()) {
            return "";
        }

        try {
            String decoded = new String(Base64.getDecoder().decode(token), StandardCharsets.UTF_8);
            int separator = decoded.indexOf(':');
            if (separator <= 0) {
                return "";
            }
            return decoded.substring(0, separator).trim();
        } catch (IllegalArgumentException ex) {
            return "";
        }
    }

    private boolean consumeToken(String key) {
        long now = System.currentTimeMillis();
        long cutoff = now - (windowSeconds * 1000L);

        pruneExpiredBuckets(cutoff);

        Deque<Long> deque = buckets.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        synchronized (deque) {
            while (!deque.isEmpty() && deque.peekFirst() < cutoff) {
                deque.pollFirst();
            }
            if (deque.size() >= maxRequests) {
                return false;
            }
            deque.addLast(now);
            return true;
        }
    }

    private void pruneExpiredBuckets(long cutoff) {
        for (var entry : buckets.entrySet()) {
            Deque<Long> deque = entry.getValue();
            synchronized (deque) {
                while (!deque.isEmpty() && deque.peekFirst() < cutoff) {
                    deque.pollFirst();
                }
                if (deque.isEmpty()) {
                    buckets.remove(entry.getKey(), deque);
                }
            }
        }
    }

    private String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
