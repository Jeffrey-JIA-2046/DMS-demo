package com.dms.user.model;

import java.util.HashSet;
import java.util.Set;

import com.dms.security.Role;
import com.fasterxml.jackson.annotation.JsonProperty;

public class AppUser {

    private String id;
    private String username;

    @JsonProperty("display_name")
    private String displayName;

    private String password;

    @JsonProperty("user_password")
    private String userPassword;

    private Role role;

    @JsonProperty("group_ids")
    private Set<String> groupIds = new HashSet<>();

    private Set<UserGroup> groups = new HashSet<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getUserPassword() {
        return userPassword;
    }

    public void setUserPassword(String userPassword) {
        this.userPassword = userPassword;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public Set<String> getGroupIds() {
        return groupIds;
    }

    public void setGroupIds(Set<String> groupIds) {
        this.groupIds = groupIds;
    }

    public Set<UserGroup> getGroups() {
        return groups;
    }

    public void setGroups(Set<UserGroup> groups) {
        this.groups = groups;
    }
}
