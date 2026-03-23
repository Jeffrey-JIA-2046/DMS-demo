package com.dms.user.config;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

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

    public UserManagementDataInitializer(AppUserRepository userRepository, UserGroupRepository groupRepository,
            PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.groupRepository = groupRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        try {
            long userCount = safeCountUsers();
            long groupCount = safeCountGroups();
            if (userCount > 0 || groupCount > 0) {
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

            userRepository.saveAll(List.of(sysAdmin, userAdmin, docAdmin, viewer));
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to initialize default users", ex);
        }
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
