package com.dms.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SessionQuotaFilter extends OncePerRequestFilter {

    private static final String LOGIN_ENDPOINT = "/api/me";
    private static final String CLIENT_SESSION_HEADER = "X-Client-Session-Id";

    private final boolean enabled;
    private final int maxSessionSeconds;
    private final int maxIdleSeconds;
    private final Map<String, SessionState> sessions = new ConcurrentHashMap<>();

    public SessionQuotaFilter(
        @Value("${app.security.session.enabled:true}") boolean enabled,
        @Value("${app.security.session.max-seconds:900}") int maxSessionSeconds,
        @Value("${app.security.session.idle-seconds:300}") int maxIdleSeconds
    ) {
        this.enabled = enabled;
        this.maxSessionSeconds = maxSessionSeconds;
        this.maxIdleSeconds = maxIdleSeconds;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
        throws ServletException, IOException {

        if (!enabled || !isProtectedRequest(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            filterChain.doFilter(request, response);
            return;
        }

        String username = authentication.getName();
        if (username == null || username.isBlank()) {
            filterChain.doFilter(request, response);
            return;
        }

        String clientSessionId = resolveClientSessionId(request);

        long now = System.currentTimeMillis();
        pruneExpiredSessions(now);

        if (isLoginRequest(request)) {
            SessionDecision loginDecision = registerOrRefreshSession(username, clientSessionId, now);
            if (!loginDecision.allowed()) {
                writeJson(response, loginDecision.statusCode(), loginDecision.message());
                return;
            }
            filterChain.doFilter(request, response);
            return;
        }

        SessionState state = sessions.get(username);
        if (state == null || isExpired(state, now)) {
            sessions.remove(username);
            writeJson(response, 401, "Session expired. Please login again.");
            return;
        }

        if (!state.clientSessionId.equals(clientSessionId)) {
            writeJson(response, 401, "Your session was signed out because this account logged in elsewhere.");
            return;
        }

        state.touch(now);
        filterChain.doFilter(request, response);
    }

    private boolean isProtectedRequest(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return LOGIN_ENDPOINT.equals(uri)
            || uri.startsWith("/api/admin/")
            || uri.startsWith("/api/audit/")
            || uri.startsWith("/api/dashboard/")
            || uri.startsWith("/api/eforms/")
            || uri.startsWith("/api/folders/")
            || uri.startsWith("/api/knowledge/");
    }

    private boolean isLoginRequest(HttpServletRequest request) {
        return LOGIN_ENDPOINT.equals(request.getRequestURI());
    }

    private String resolveClientSessionId(HttpServletRequest request) {
        String headerValue = request.getHeader(CLIENT_SESSION_HEADER);
        if (headerValue != null) {
            String trimmed = headerValue.trim();
            if (!trimmed.isEmpty()) {
                return trimmed;
            }
        }

        String remoteAddr = request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr().trim();
        String userAgent = request.getHeader("User-Agent");
        String normalizedAgent = userAgent == null ? "unknown" : userAgent.trim();
        return "legacy-" + remoteAddr + "-" + normalizedAgent;
    }

    private SessionDecision registerOrRefreshSession(String username, String clientSessionId, long now) {
        SessionState existing = sessions.get(username);
        if (existing != null) {
            if (isExpired(existing, now)) {
                sessions.remove(username, existing);
            } else if (!existing.clientSessionId.equals(clientSessionId)) {
                // Latest-login-wins policy: replace existing client session for this username.
                sessions.put(username, new SessionState(clientSessionId, now));
                return SessionDecision.allow();
            } else {
                existing.touch(now);
                return SessionDecision.allow();
            }
        }

        synchronized (sessions) {
            pruneExpiredSessions(now);
            SessionState active = sessions.get(username);
            if (active != null && !isExpired(active, now)) {
                if (!active.clientSessionId.equals(clientSessionId)) {
                    // Latest-login-wins policy: replace existing client session for this username.
                    sessions.put(username, new SessionState(clientSessionId, now));
                    return SessionDecision.allow();
                }
                active.touch(now);
                return SessionDecision.allow();
            }
            sessions.put(username, new SessionState(clientSessionId, now));
            return SessionDecision.allow();
        }
    }

    private void pruneExpiredSessions(long now) {
        sessions.entrySet().removeIf(entry -> isExpired(entry.getValue(), now));
    }

    private boolean isExpired(SessionState state, long now) {
        long ageMs = now - state.createdAtMillis;
        long idleMs = now - state.lastSeenMillis;

        boolean absoluteExpired = maxSessionSeconds > 0 && ageMs > (maxSessionSeconds * 1000L);
        boolean idleExpired = maxIdleSeconds > 0 && idleMs > (maxIdleSeconds * 1000L);
        return absoluteExpired || idleExpired;
    }

    private void writeJson(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }

    private static class SessionState {
        private final String clientSessionId;
        private final long createdAtMillis;
        private volatile long lastSeenMillis;

        private SessionState(String clientSessionId, long now) {
            this.clientSessionId = clientSessionId;
            this.createdAtMillis = now;
            this.lastSeenMillis = now;
        }

        private void touch(long now) {
            this.lastSeenMillis = now;
        }
    }

    private record SessionDecision(boolean allowed, int statusCode, String message) {
        private static SessionDecision allow() {
            return new SessionDecision(true, 200, "");
        }

        private static SessionDecision block(int statusCode, String message) {
            return new SessionDecision(false, statusCode, message);
        }
    }
}
