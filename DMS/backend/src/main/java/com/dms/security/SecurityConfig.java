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
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/admin/**").hasRole("SYS_ADMIN")
                .requestMatchers("/api/audit/**").authenticated()
                .requestMatchers("/api/dashboard/**").authenticated()
                .requestMatchers("/api/folders/**").authenticated()
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
    public UserDetailsService userDetailsService(AppUserRepository repository) {
        return username -> {
            try {
                return repository.findByUsernameIgnoreCase(username)
                    .map(user -> User.withUsername(user.getUsername())
                        .password(resolveStoredPassword(user))
                        .roles(user.getRole().name())
                        .build())
                    .orElseThrow(() -> new UsernameNotFoundException("User not found"));
            } catch (java.io.IOException ex) {
                throw new UsernameNotFoundException("User lookup failed", ex);
            }
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
