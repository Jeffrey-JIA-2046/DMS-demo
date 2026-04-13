package com.dms.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.util.StringUtils;

import com.dms.security.crypto.AesPasswordEncoder;
import com.dms.user.model.AppUser;
import com.dms.user.repository.AppUserRepository;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .headers(headers -> headers
                .addHeaderWriter((request, response) -> {
                    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
                    response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
                })
            )
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/admin/**").hasRole("SYS_ADMIN")
                .requestMatchers("/api/audit/**").authenticated()
                .requestMatchers("/api/dashboard/**").authenticated()
                .requestMatchers("/api/folders/**").authenticated()
                .requestMatchers("/api/knowledge/**").authenticated()
                .requestMatchers("/api/me").authenticated()
                .anyRequest().permitAll()
            )
            .httpBasic(Customizer.withDefaults());
        return http.build();
    }

    @Bean
    public AesPasswordEncoder passwordEncoder(@Value("${app.security.password-encryption-key}") String encryptionKey) {
        return new AesPasswordEncoder(encryptionKey);
    }

    @Bean
    public UserDetailsService userDetailsService(AppUserRepository repository, javax.sql.DataSource dataSource) {
        return username -> {
            try {
                java.util.Optional<com.dms.user.model.AppUser> maybe = repository.findByUsernameIgnoreCase(username);
                if (maybe.isPresent()) {
                    com.dms.user.model.AppUser user = maybe.get();
                    return User.withUsername(user.getUsername())
                        .password(resolveStoredPassword(user))
                        .roles(user.getRole().name())
                        .build();
                }
            } catch (java.io.IOException ex) {
                // fallthrough to try JDBC
            }

            // Fallback: query MySQL `app_users` table directly if OpenSearch lookup fails or is unavailable
            try (java.sql.Connection conn = dataSource.getConnection()) {
                try (java.sql.PreparedStatement ps = conn.prepareStatement("SELECT username, user_password, password, role FROM app_users WHERE username = ? LIMIT 1")) {
                    ps.setString(1, username);
                    try (java.sql.ResultSet rs = ps.executeQuery()) {
                        if (rs.next()) {
                            com.dms.user.model.AppUser user = new com.dms.user.model.AppUser();
                            user.setUsername(rs.getString("username"));
                            user.setUserPassword(rs.getString("user_password"));
                            user.setPassword(rs.getString("password"));
                            String roleStr = rs.getString("role");
                            if (roleStr != null) {
                                try {
                                    user.setRole(com.dms.security.Role.valueOf(roleStr));
                                } catch (IllegalArgumentException e) {
                                    user.setRole(com.dms.security.Role.DOC_VIEWER);
                                }
                            }
                            return User.withUsername(user.getUsername())
                                .password(resolveStoredPassword(user))
                                .roles(user.getRole().name())
                                .build();
                        }
                    }
                }
            } catch (java.sql.SQLException sqe) {
                throw new UsernameNotFoundException("User lookup failed", sqe);
            }

            throw new UsernameNotFoundException("User not found");
        };
    }

    private String resolveStoredPassword(AppUser user) {
        if (StringUtils.hasText(user.getUserPassword())) {
            return user.getUserPassword();
        }
        if (StringUtils.hasText(user.getPassword())) {
            return user.getPassword();
        }
        throw new UsernameNotFoundException("User password not configured");
    }
}
