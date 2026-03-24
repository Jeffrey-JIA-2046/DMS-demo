package com.dms.config;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.List;

import javax.sql.DataSource;

import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch.indices.CreateIndexRequest;
import org.opensearch.client.opensearch.indices.ExistsRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import com.dms.security.Role;
import com.dms.user.model.AppUser;
import com.dms.user.repository.AppUserRepository;

/**
 * Creates all required OpenSearch indices on startup if they don't exist,
 * and seeds the users index from MySQL when it is initially empty.
 */
@Component
public class OpenSearchIndexInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(OpenSearchIndexInitializer.class);

    private final OpenSearchClient openSearchClient;
    private final AppUserRepository appUserRepository;
    private final MysqlToOpenSearchDocumentMigration mysqlToOpenSearchDocumentMigration;

    @Autowired(required = false)
    private DataSource dataSource;

    @Value("${app.opensearch.users-index:dms-app-users}")
    private String usersIndex;

    @Value("${app.opensearch.groups-index:dms-user-groups}")
    private String groupsIndex;

    @Value("${app.opensearch.audit-index:dms-audit-logs}")
    private String auditIndex;

    @Value("${app.opensearch.documents-index:dms-documents}")
    private String documentsIndex;

    @Value("${app.opensearch.folders-index:dms-document-folders}")
    private String foldersIndex;

    @Value("${app.opensearch.user-tasks-index:dms-user-tasks}")
    private String userTasksIndex;

    @Value("${app.opensearch.knowledge-index:dms-knowledge}")
    private String knowledgeIndex;

    @Value("${app.opensearch.ocr-documents-index:dms-ocr-document}")
    private String ocrDocumentsIndex;

    @Value("${app.opensearch.enabled:false}")
    private boolean openSearchEnabled;

    public OpenSearchIndexInitializer(OpenSearchClient openSearchClient,
                                      AppUserRepository appUserRepository,
                                      MysqlToOpenSearchDocumentMigration mysqlToOpenSearchDocumentMigration) {
        this.openSearchClient = openSearchClient;
        this.appUserRepository = appUserRepository;
        this.mysqlToOpenSearchDocumentMigration = mysqlToOpenSearchDocumentMigration;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!openSearchEnabled) {
            log.info("OpenSearch is disabled by configuration (app.opensearch.enabled=false). Running in MySQL mode.");
            return;
        }

        List<String> indices = List.of(
            usersIndex, groupsIndex, auditIndex, documentsIndex,
            foldersIndex, userTasksIndex, knowledgeIndex, ocrDocumentsIndex,
            "document-versions"
        );

        for (String index : indices) {
            ensureIndexExists(index);
        }

        if (dataSource != null) {
            seedUsersFromMysql();
        }

        mysqlToOpenSearchDocumentMigration.migrateIfNeeded();
    }

    private void ensureIndexExists(String indexName) {
        try {
            boolean exists = openSearchClient.indices()
                .exists(new ExistsRequest.Builder().index(indexName).build())
                .value();
            if (!exists) {
                openSearchClient.indices().create(
                    new CreateIndexRequest.Builder().index(indexName).build()
                );
                log.info("Created OpenSearch index: {}", indexName);
            }
        } catch (Exception ex) {
            log.warn("Could not ensure OpenSearch index '{}': {}", indexName, ex.getMessage());
        }
    }

    private void seedUsersFromMysql() {
        try {
            // Only seed if the users index is currently empty
            long count = appUserRepository.findAll().size();
            if (count > 0) {
                log.debug("OpenSearch users index already has {} users, skipping seed.", count);
                return;
            }
        } catch (Exception ex) {
            log.debug("Could not count users in OpenSearch, proceeding with seed attempt: {}", ex.getMessage());
        }

        try (Connection conn = dataSource.getConnection()) {
            String sql = "SELECT id, username, display_name, password, user_password, role FROM app_users";
            try (PreparedStatement ps = conn.prepareStatement(sql);
                 ResultSet rs = ps.executeQuery()) {
                int seeded = 0;
                while (rs.next()) {
                    try {
                        AppUser user = new AppUser();
                        user.setId(rs.getString("id"));
                        user.setUsername(rs.getString("username"));
                        user.setDisplayName(rs.getString("display_name"));
                        user.setPassword(rs.getString("password"));
                        user.setUserPassword(rs.getString("user_password"));
                        String roleStr = rs.getString("role");
                        if (roleStr != null) {
                            user.setRole(Role.valueOf(roleStr));
                        }
                        appUserRepository.save(user);
                        seeded++;
                    } catch (Exception ex) {
                        log.warn("Failed to seed user '{}': {}", rs.getString("username"), ex.getMessage());
                    }
                }
                if (seeded > 0) {
                    log.info("Seeded {} user(s) from MySQL into OpenSearch index '{}'.", seeded, usersIndex);
                }
            }
        } catch (Exception ex) {
            log.warn("Could not seed users from MySQL: {}", ex.getMessage());
        }
    }
}
