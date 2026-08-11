package com.dms.config;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.sql.DataSource;

import org.opensearch.client.opensearch._types.mapping.Property;
import org.opensearch.client.opensearch.ingest.Processor;
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

    @Value("${app.opensearch.attachments-index:dms-attachments}")
    private String attachmentsIndex;

    @Value("${app.opensearch.attachments-pipeline:dms-attachments-pipeline}")
    private String attachmentsPipeline;

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
            attachmentsIndex, "document-versions"
        );

        for (String index : indices) {
            if (attachmentsIndex.equals(index)) {
                ensureAttachmentsIndexExists(index);
            } else {
                ensureIndexExists(index);
            }
        }

        ensureAttachmentPipelineExists();

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

    private void ensureAttachmentsIndexExists(String indexName) {
        try {
            boolean exists = openSearchClient.indices()
                .exists(new ExistsRequest.Builder().index(indexName).build())
                .value();
            if (!exists) {
                Map<String, Property> attachmentProperties = new LinkedHashMap<>();
                attachmentProperties.put("content", Property.of(ap -> ap.text(t -> t)));
                attachmentProperties.put("title", Property.of(ap -> ap.text(t -> t)));
                attachmentProperties.put("author", Property.of(ap -> ap.text(t -> t)));
                attachmentProperties.put("content_type", Property.of(ap -> ap.keyword(k -> k)));
                attachmentProperties.put("content_length", Property.of(ap -> ap.long_(l -> l)));
                attachmentProperties.put("language", Property.of(ap -> ap.keyword(k -> k)));

                Map<String, Property> indexProperties = new LinkedHashMap<>();
                indexProperties.put("document_id", Property.of(p -> p.keyword(k -> k)));
                indexProperties.put("document_version_id", Property.of(p -> p.keyword(k -> k)));
                indexProperties.put("title", Property.of(p -> p.text(t -> t)));
                indexProperties.put("description", Property.of(p -> p.text(t -> t)));
                indexProperties.put("owner", Property.of(p -> p.keyword(k -> k)));
                indexProperties.put("category", Property.of(p -> p.keyword(k -> k)));
                indexProperties.put("folder_id", Property.of(p -> p.keyword(k -> k)));
                indexProperties.put("file_name", Property.of(p -> p.keyword(k -> k)));
                indexProperties.put("content_type", Property.of(p -> p.keyword(k -> k)));
                indexProperties.put("size_bytes", Property.of(p -> p.long_(l -> l)));
                indexProperties.put("created_at", Property.of(p -> p.date(d -> d)));
                indexProperties.put("data", Property.of(p -> p.binary(b -> b)));
                indexProperties.put("max_chars", Property.of(p -> p.integer(i -> i)));
                indexProperties.put("attachment", Property.of(p -> p.object(o -> o.properties(attachmentProperties))));

                openSearchClient.indices().create(
                    new CreateIndexRequest.Builder()
                        .index(indexName)
                        .mappings(m -> m.properties(indexProperties))
                        .build()
                );
                log.info("Created OpenSearch attachment index: {}", indexName);
            }
        } catch (Exception ex) {
            log.warn("Could not ensure OpenSearch attachment index '{}': {}", indexName, ex.getMessage());
        }
    }

    private void ensureAttachmentPipelineExists() {
        try {
            openSearchClient.ingest().putPipeline(p -> p
                .id(attachmentsPipeline)
                .description("Extract attachment content for DMS uploads")
                .processors(List.of(
                    Processor.of(pr -> pr.attachment(a -> a
                        .field("data")
                        .targetField("attachment")
                        .properties(List.of("content", "title", "author", "content_type", "content_length", "language"))
                        .indexedChars(100000L)
                        .indexedCharsField("max_chars")
                        .ignoreMissing(true)
                    ))
                ))
            );
            log.info("Ensured OpenSearch ingest pipeline: {}", attachmentsPipeline);
        } catch (Exception ex) {
            log.warn("Could not ensure OpenSearch attachment pipeline '{}': {}", attachmentsPipeline, ex.getMessage());
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
