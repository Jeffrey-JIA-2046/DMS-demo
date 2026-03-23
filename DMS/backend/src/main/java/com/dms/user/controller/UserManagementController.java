package com.dms.user.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.dms.user.dto.GroupRequest;
import com.dms.user.dto.GroupResponse;
import com.dms.user.dto.UserRequest;
import com.dms.user.dto.UserResponse;
import com.dms.user.service.UserManagementService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin")
public class UserManagementController {

    private final UserManagementService service;

    public UserManagementController(UserManagementService service) {
        this.service = service;
    }

    @GetMapping("/groups")
    public List<GroupResponse> listGroups() {
        return service.listGroups();
    }

    @PostMapping("/groups")
    public GroupResponse createGroup(@RequestBody @Valid GroupRequest request) {
        return service.createGroup(request);
    }

    @PutMapping("/groups/{id}")
    public GroupResponse updateGroup(@PathVariable String id, @RequestBody @Valid GroupRequest request) {
        return service.updateGroup(id, request);
    }

    @DeleteMapping("/groups/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteGroup(@PathVariable String id) {
        service.deleteGroup(id);
    }

    @GetMapping("/users")
    public List<UserResponse> listUsers() {
        return service.listUsers();
    }

    @PostMapping("/users")
    public UserResponse createUser(@RequestBody @Valid UserRequest request) {
        return service.createUser(request);
    }

    @PutMapping("/users/{id}")
    public UserResponse updateUser(@PathVariable String id, @RequestBody @Valid UserRequest request) {
        return service.updateUser(id, request);
    }

    @DeleteMapping("/users/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteUser(@PathVariable String id) {
        service.deleteUser(id);
    }
}
