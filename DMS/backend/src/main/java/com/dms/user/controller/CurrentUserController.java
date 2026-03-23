package com.dms.user.controller;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.dms.user.dto.CurrentUserResponse;
import com.dms.user.model.AppUser;
import com.dms.user.repository.AppUserRepository;

@RestController
@RequestMapping("/api")
public class CurrentUserController {

    private final AppUserRepository appUserRepository;

    public CurrentUserController(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    @GetMapping("/me")
    public CurrentUserResponse currentUser(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        try {
            AppUser user = appUserRepository.findByUsernameIgnoreCase(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
            return new CurrentUserResponse(user.getUsername(), user.getDisplayName(), user.getRole());
        } catch (java.io.IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to load current user", ex);
        }
    }
}
