package com.dms.user.config;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.boot.CommandLineRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.dms.security.Role;
import com.dms.user.model.AppUser;
import com.dms.user.model.UserGroup;
import com.dms.user.repository.AppUserRepository;
import com.dms.user.repository.UserGroupRepository;

@Component
public class UserManagementDataInitializer implements CommandLineRunner {

    private final AppUserRepository userRepository;
    private final UserGroupRepository groupRepository;
    private final PasswordEncoder passwordEncoder;
    private final String rootUsername;
    private final String rootDisplayName;
    private final String rootPassword;

    public UserManagementDataInitializer(AppUserRepository userRepository, UserGroupRepository groupRepository,
            PasswordEncoder passwordEncoder,
            @Value("${app.user-management.root.username:root}") String rootUsername,
            @Value("${app.user-management.root.display-name:Root Admin}") String rootDisplayName,
            @Value("${app.user-management.root.password:P@ssw0rd}") String rootPassword) {
        this.userRepository = userRepository;
        this.groupRepository = groupRepository;
        this.passwordEncoder = passwordEncoder;
        this.rootUsername = sanitizeOrDefault(rootUsername, "root");
        this.rootDisplayName = sanitizeOrDefault(rootDisplayName, "Root Admin");
        this.rootPassword = sanitizeOrDefault(rootPassword, "P@ssw0rd");
    }

    @Override
    public void run(String... args) {
        try {
            long userCount = safeCountUsers();
            long groupCount = safeCountGroups();
            if (userCount > 0 || groupCount > 0) {
                ensureRootUserExists();
                return;
            }

            UserGroup compliance = new UserGroup();
            compliance.setName("Compliance");
            compliance.setDescription("Manages policy adherence and audits");

            UserGroup operations = new UserGroup();
            operations.setName("Operations");
            operations.setDescription("Oversees workspace provisioning and onboarding");

            UserGroup finance = new UserGroup();
            finance.setName("Finance");
            finance.setDescription("Handles LOB billing and contracts");

            groupRepository.saveAll(List.of(compliance, operations, finance));

            AppUser sysAdmin = new AppUser();
            sysAdmin.setUsername("sysadmin");
            sysAdmin.setDisplayName("System Admin");
            sysAdmin.setRole(Role.SYS_ADMIN);
            sysAdmin.setPassword(passwordEncoder.encode("P@ssw0rd"));
            sysAdmin.setUserPassword(sysAdmin.getPassword());
            sysAdmin.setGroups(new HashSet<>(Set.of(compliance, operations)));

            AppUser root = new AppUser();
            root.setUsername(rootUsername);
            root.setDisplayName(rootDisplayName);
            root.setRole(Role.ROOT);
            root.setPassword(passwordEncoder.encode(rootPassword));
            root.setUserPassword(root.getPassword());
            root.setGroups(new HashSet<>(Set.of(compliance, operations)));

            AppUser userAdmin = new AppUser();
            userAdmin.setUsername("useradmin");
            userAdmin.setDisplayName("User Admin");
            userAdmin.setRole(Role.USER_ADMIN);
            userAdmin.setPassword(passwordEncoder.encode("P@ssw0rd"));
            userAdmin.setUserPassword(userAdmin.getPassword());
            userAdmin.setGroups(new HashSet<>(Set.of(operations)));

            AppUser docAdmin = new AppUser();
            docAdmin.setUsername("docadmin");
            docAdmin.setDisplayName("Document Admin");
            docAdmin.setRole(Role.DOC_ADMIN);
            docAdmin.setPassword(passwordEncoder.encode("P@ssw0rd"));
            docAdmin.setUserPassword(docAdmin.getPassword());
            docAdmin.setGroups(new HashSet<>(Set.of(finance)));

            AppUser viewer = new AppUser();
            viewer.setUsername("viewer");
            viewer.setDisplayName("Read Only");
            viewer.setRole(Role.DOC_VIEWER);
            viewer.setPassword(passwordEncoder.encode("P@ssw0rd"));
            viewer.setUserPassword(viewer.getPassword());
            viewer.setGroups(new HashSet<>(Set.of(compliance)));

            userRepository.saveAll(List.of(root, sysAdmin, userAdmin, docAdmin, viewer));
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to initialize default users", ex);
        }
    }

    private void ensureRootUserExists() throws java.io.IOException {
        List<AppUser> allUsers = userRepository.findAll();
        long rootCount = allUsers.stream()
            .filter(user -> user != null && user.getRole() == Role.ROOT)
            .count();
        if (rootCount > 0) {
            return;
        }

        AppUser root = new AppUser();
        root.setUsername(rootUsername);
        root.setDisplayName(rootDisplayName);
        root.setRole(Role.ROOT);
        root.setPassword(passwordEncoder.encode(rootPassword));
        root.setUserPassword(root.getPassword());
        root.setGroups(new HashSet<>());
        userRepository.save(root);
    }

    private String sanitizeOrDefault(String value, String fallback) {
        if (!StringUtils.hasText(value)) {
            return fallback;
        }
        return value.trim();
    }

    private long safeCountUsers() {
        try {
            return userRepository.count();
        } catch (Exception ex) {
            return 0L;
        }
    }

    private long safeCountGroups() {
        try {
            return groupRepository.count();
        } catch (Exception ex) {
            return 0L;
        }
    }
}
