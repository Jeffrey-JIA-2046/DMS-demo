package com.dms.knowledge.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import com.dms.document.dto.PageResponse;
import com.dms.document.model.Document;
import com.dms.document.repository.DocumentRepository;
import com.dms.exception.KnowledgeOperationException;
import com.dms.exception.ResourceNotFoundException;
import com.dms.knowledge.dto.KnowledgeAttachmentResponse;
import com.dms.knowledge.dto.KnowledgeChainExport;
import com.dms.knowledge.dto.KnowledgeContributionRequest;
import com.dms.knowledge.dto.KnowledgeContributionResponse;
import com.dms.knowledge.dto.KnowledgeDocumentLinkRequest;
import com.dms.knowledge.dto.KnowledgeDocumentLinkResponse;
import com.dms.knowledge.dto.KnowledgeMemberResponse;
import com.dms.knowledge.dto.KnowledgeShareRequest;
import com.dms.knowledge.dto.KnowledgeShareResponse;
import com.dms.knowledge.dto.KnowledgeTopicDetailsResponse;
import com.dms.knowledge.dto.KnowledgeTopicRequest;
import com.dms.knowledge.dto.KnowledgeTopicSummaryResponse;
import com.dms.knowledge.dto.KnowledgeTopicUpdateRequest;
import com.dms.knowledge.model.KnowledgeContribution;
import com.dms.knowledge.model.KnowledgeTopic;
import com.dms.knowledge.model.KnowledgeTopicDocumentLink;
import com.dms.knowledge.model.KnowledgeTopicMember;
import com.dms.knowledge.model.KnowledgeTopicShare;
import com.dms.knowledge.model.KnowledgeTopicStar;
import com.dms.knowledge.model.KnowledgeTopicUpload;
import com.dms.knowledge.repository.KnowledgeContributionRepository;
import com.dms.knowledge.repository.KnowledgeTopicDocumentLinkRepository;
import com.dms.knowledge.repository.KnowledgeTopicMemberRepository;
import com.dms.knowledge.repository.KnowledgeTopicRepository;
import com.dms.knowledge.repository.KnowledgeTopicShareRepository;
import com.dms.knowledge.repository.KnowledgeTopicStarRepository;
import com.dms.knowledge.repository.KnowledgeTopicUploadRepository;
import com.dms.user.model.AppUser;
import com.dms.user.repository.AppUserRepository;

@Service
public class KnowledgeTopicService {

    private static final long MAX_UPLOAD_BYTES = 25L * 1024 * 1024;

    private final KnowledgeTopicRepository topicRepository;
    private final KnowledgeTopicMemberRepository memberRepository;
    private final KnowledgeTopicStarRepository starRepository;
    private final KnowledgeContributionRepository contributionRepository;
    private final KnowledgeTopicDocumentLinkRepository documentLinkRepository;
    private final KnowledgeTopicUploadRepository uploadRepository;
    private final KnowledgeTopicShareRepository shareRepository;
    private final DocumentRepository documentRepository;
    private final AppUserRepository appUserRepository;
    private final Clock clock;

    public KnowledgeTopicService(
        KnowledgeTopicRepository topicRepository,
        KnowledgeTopicMemberRepository memberRepository,
        KnowledgeTopicStarRepository starRepository,
        KnowledgeContributionRepository contributionRepository,
        KnowledgeTopicDocumentLinkRepository documentLinkRepository,
        KnowledgeTopicUploadRepository uploadRepository,
        KnowledgeTopicShareRepository shareRepository,
        DocumentRepository documentRepository,
        AppUserRepository appUserRepository,
        Clock clock
    ) {
        this.topicRepository = topicRepository;
        this.memberRepository = memberRepository;
        this.starRepository = starRepository;
        this.contributionRepository = contributionRepository;
        this.documentLinkRepository = documentLinkRepository;
        this.uploadRepository = uploadRepository;
        this.shareRepository = shareRepository;
        this.documentRepository = documentRepository;
        this.appUserRepository = appUserRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PageResponse<KnowledgeTopicSummaryResponse> searchTopics(
        String query,
        Collection<String> tags,
        boolean starredOnly,
        boolean joinedOnly,
        Pageable pageable,
        String username
    ) {
        AppUser user = requireUser(username);
        
        Pageable resolved = pageable.getSort().isSorted()
            ? pageable
            : PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), Sort.by(Sort.Direction.DESC, "updatedAt"));

        String normalizedQuery = trimToNull(query);
        Set<String> normalizedTags = normalizeTags(tags);

        List<KnowledgeTopicSummaryResponse> filtered = loadAllTopicsSorted(resolved.getSort()).stream()
            .filter(topic -> matchesTopicQuery(topic, normalizedQuery))
            .filter(topic -> normalizedTags.isEmpty() || topic.getTags().stream().anyMatch(normalizedTags::contains))
            .filter(topic -> !joinedOnly || memberRepository.existsByTopicIdAndUserId(topic.getId(), user.getId()))
            .map(topic -> toSummary(topic, user))
            .filter(summary -> !starredOnly || summary.starredByMe())
            .collect(Collectors.toCollection(ArrayList::new));

        filtered.sort(
            Comparator.comparingInt(KnowledgeTopicSummaryResponse::starCount)
                .reversed()
                .thenComparing(KnowledgeTopicSummaryResponse::title, String.CASE_INSENSITIVE_ORDER)
        );

        int pageNumber = Math.max(0, resolved.getPageNumber());
        int pageSize = Math.max(1, resolved.getPageSize());
        int fromIndex = Math.min(filtered.size(), pageNumber * pageSize);
        int toIndex = Math.min(filtered.size(), fromIndex + pageSize);
        List<KnowledgeTopicSummaryResponse> content = filtered.subList(fromIndex, toIndex);

        long totalElements = filtered.size();
        int totalPages = (int) Math.ceil(totalElements / (double) pageSize);
        boolean last = pageNumber >= Math.max(0, totalPages - 1);
        return new PageResponse<>(content, pageNumber, pageSize, totalElements, totalPages, last);
    }

    @Transactional(readOnly = true)
    public KnowledgeTopicDetailsResponse getTopic(String topicId, String username) {
        AppUser user = requireUser(username);
        KnowledgeTopic topic = requireTopic(topicId);
        return toDetails(topic, user);
    }

    @Transactional
    public KnowledgeTopicDetailsResponse createTopic(KnowledgeTopicRequest request, String username) {
        AppUser creator = requireUser(username);
        Instant now = Instant.now(clock);
        KnowledgeTopic topic = new KnowledgeTopic();
        topic.setTitle(request.title().trim());
        topic.setDescription(trimToNull(request.description()));
        topic.setTags(normalizeTags(request.tags()));
        topic.setCreatedBy(creator);
        topic.setCreatedAt(now);
        topic.setUpdatedAt(now);
        KnowledgeTopic saved = saveTopic(topic);
        createMembership(saved, creator, now);
        return toDetails(saved, creator);
    }

    @Transactional
    public KnowledgeTopicDetailsResponse updateTopic(String topicId, KnowledgeTopicUpdateRequest request, String username) {
        AppUser actor = requireUser(username);
        KnowledgeTopic topic = requireTopic(topicId);
        assertMembership(topic, actor);
        boolean changed = false;
        if (StringUtils.hasText(request.title())) {
            topic.setTitle(request.title().trim());
            changed = true;
        }
        if (request.description() != null) {
            topic.setDescription(trimToNull(request.description()));
            changed = true;
        }
        if (request.tags() != null) {
            topic.setTags(normalizeTags(request.tags()));
            changed = true;
        }
        if (changed) {
            topic.setUpdatedAt(Instant.now(clock));
            saveTopic(topic);
        }
        return toDetails(topic, actor);
    }

    @Transactional
    public KnowledgeTopicDetailsResponse joinTopic(String topicId, String username) {
        AppUser user = requireUser(username);
        KnowledgeTopic topic = requireTopic(topicId);
        if (!memberRepository.existsByTopicIdAndUserId(topic.getId(), user.getId())) {
            createMembership(topic, user, Instant.now(clock));
        }
        return toDetails(topic, user);
    }

    @Transactional
    public KnowledgeTopicDetailsResponse addContribution(String topicId, KnowledgeContributionRequest request, String username) {
        AppUser user = requireUser(username);
        KnowledgeTopic topic = requireTopic(topicId);
        assertMembership(topic, user);
        Instant now = Instant.now(clock);
        KnowledgeContribution contribution = new KnowledgeContribution();
        contribution.setTopic(topic);
        contribution.setAuthor(user);
        contribution.setContent(request.content().trim());
        contribution.setCreatedAt(now);
        if (request.linkedDocumentId() != null) {
            Document document = findDocument(request.linkedDocumentId());
            contribution.setLinkedDocumentId(document.getId());
            contribution.setLinkedDocumentTitle(document.getTitle());
        }
        saveContribution(contribution);
        topic.setUpdatedAt(now);
        saveTopic(topic);
        return toDetails(topic, user);
    }

    @Transactional
    public KnowledgeTopicDetailsResponse shareTopic(String topicId, KnowledgeShareRequest request, String username) {
        AppUser sender = requireUser(username);
        KnowledgeTopic topic = requireTopic(topicId);
        assertMembership(topic, sender);
        Set<String> targets = normalizeUsernames(request.recipientUsernames());
        if (targets.isEmpty()) {
            throw new KnowledgeOperationException("At least one valid username is required");
        }
        Instant now = Instant.now(clock);
        String message = trimToNull(request.message());
        for (String recipientUsername : targets) {
            AppUser recipient = findUserByUsername(recipientUsername)
                .orElseThrow(() -> new KnowledgeOperationException("Recipient %s not found".formatted(recipientUsername)));
            KnowledgeTopicShare share = new KnowledgeTopicShare();
            share.setTopic(topic);
            share.setSender(sender);
            share.setRecipient(recipient);
            share.setMessage(message);
            share.setSharedAt(now);
            saveShare(share);
            if (!memberRepository.existsByTopicIdAndUserId(topic.getId(), recipient.getId())) {
                createMembership(topic, recipient, now);
            }
        }
        topic.setUpdatedAt(now);
        saveTopic(topic);
        return toDetails(topic, sender);
    }

    @Transactional
    public KnowledgeTopicDetailsResponse starTopic(String topicId, String username) {
        AppUser user = requireUser(username);
        KnowledgeTopic topic = requireTopic(topicId);
        if (!starRepository.existsByTopicIdAndUserId(topic.getId(), user.getId())) {
            KnowledgeTopicStar star = new KnowledgeTopicStar();
            star.setTopic(topic);
            star.setUser(user);
            star.setStarredAt(Instant.now(clock));
            saveStar(star);
        }
        return toDetails(topic, user);
    }

    @Transactional
    public KnowledgeTopicDetailsResponse unstarTopic(String topicId, String username) {
        AppUser user = requireUser(username);
        KnowledgeTopic topic = requireTopic(topicId);
        starRepository.findByTopicIdAndUserId(topic.getId(), user.getId()).ifPresent(starRepository::delete);
        return toDetails(topic, user);
    }

    @Transactional
    public KnowledgeTopicDetailsResponse linkDocument(String topicId, KnowledgeDocumentLinkRequest request, String username) {
        AppUser user = requireUser(username);
        KnowledgeTopic topic = requireTopic(topicId);
        assertMembership(topic, user);
        Document document = findDocument(request.documentId());
        Instant now = Instant.now(clock);
        KnowledgeTopicDocumentLink link = new KnowledgeTopicDocumentLink();
        link.setTopic(topic);
        link.setDocumentId(document.getId());
        link.setDocumentTitle(document.getTitle());
        link.setNote(trimToNull(request.note()));
        link.setLinkedBy(user);
        link.setLinkedAt(now);
        saveDocumentLink(link);
        topic.setUpdatedAt(now);
        saveTopic(topic);
        return toDetails(topic, user);
    }

    @Transactional
    public KnowledgeTopicDetailsResponse unlinkDocument(String topicId, String linkId, String username) {
        AppUser user = requireUser(username);
        KnowledgeTopic topic = requireTopic(topicId);
        assertMembership(topic, user);
        KnowledgeTopicDocumentLink link = documentLinkRepository.findByIdAndTopicId(linkId, topic.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Document link not found"));
        documentLinkRepository.delete(link);
        topic.setUpdatedAt(Instant.now(clock));
        saveTopic(topic);
        return toDetails(topic, user);
    }

    @Transactional
    public KnowledgeTopicDetailsResponse uploadAttachment(String topicId, String description, MultipartFile file, String username) {
        AppUser user = requireUser(username);
        KnowledgeTopic topic = requireTopic(topicId);
        assertMembership(topic, user);
        if (file == null || file.isEmpty()) {
            throw new KnowledgeOperationException("A file is required");
        }
        if (file.getSize() > MAX_UPLOAD_BYTES) {
            throw new KnowledgeOperationException("File exceeds the 25 MB limit");
        }
        Instant now = Instant.now(clock);
        KnowledgeTopicUpload upload = new KnowledgeTopicUpload();
        upload.setTopic(topic);
        upload.setFileName(file.getOriginalFilename() != null ? file.getOriginalFilename() : "upload.bin");
        upload.setContentType(file.getContentType());
        upload.setSize(file.getSize());
        upload.setDescription(trimToNull(description));
        upload.setUploadedBy(user);
        upload.setUploadedAt(now);
        try {
            upload.setContent(file.getBytes());
        } catch (IOException ex) {
            throw new KnowledgeOperationException("Unable to read uploaded file");
        }
        saveUpload(upload);
        topic.setUpdatedAt(now);
        saveTopic(topic);
        return toDetails(topic, user);
    }

    @Transactional(readOnly = true)
    public KnowledgeChainExport downloadKnowledgeChain(String topicId, String username) {
        AppUser user = requireUser(username);
        KnowledgeTopic topic = requireTopic(topicId);
        assertMembership(topic, user);
        List<KnowledgeContribution> timeline = contributionRepository.findByTopicIdOrderByCreatedAtAsc(topic.getId());
        List<KnowledgeTopicDocumentLink> links = documentLinkRepository.findByTopicIdOrderByLinkedAtDesc(topic.getId());
        List<KnowledgeTopicUpload> uploads = uploadRepository.findByTopicIdOrderByUploadedAtDesc(topic.getId());
        StringBuilder builder = new StringBuilder();
        builder.append("# ").append(topic.getTitle()).append("\n\n");
        if (StringUtils.hasText(topic.getDescription())) {
            builder.append(topic.getDescription()).append("\n\n");
        }
        builder.append("## Knowledge chain\n\n");
        DateTimeFormatter formatter = DateTimeFormatter.ISO_INSTANT;
        if (timeline.isEmpty()) {
            builder.append("No contributions recorded yet.\n");
        } else {
            timeline.forEach(entry -> {
                builder.append("- ")
                    .append(formatter.format(entry.getCreatedAt()))
                    .append(" · ")
                    .append(displayName(entry.getAuthor()))
                    .append(": ")
                    .append(entry.getContent())
                    .append('\n');
                if (entry.getLinkedDocumentId() != null) {
                    builder.append("  (Linked document #")
                        .append(entry.getLinkedDocumentId())
                        .append(" · ")
                        .append(entry.getLinkedDocumentTitle())
                        .append(")\n");
                }
            });
        }
        builder.append("\n## Linked documents\n\n");
        if (links.isEmpty()) {
            builder.append("None\n");
        } else {
            links.forEach(link -> builder.append("- ")
                .append(link.getDocumentTitle() != null ? link.getDocumentTitle() : ("Document #" + link.getDocumentId()))
                .append(" (ID ")
                .append(link.getDocumentId())
                .append(") — added by ")
                .append(displayName(link.getLinkedBy()))
                .append(" on ")
                .append(formatter.format(link.getLinkedAt()))
                .append(link.getNote() != null ? ". Note: " + link.getNote() : "")
                .append('\n'));
        }
        builder.append("\n## Topic uploads\n\n");
        if (uploads.isEmpty()) {
            builder.append("None\n");
        } else {
            uploads.forEach(upload -> builder.append("- ")
                .append(upload.getFileName())
                .append(" (")
                .append(upload.getSize())
                .append(" bytes) uploaded by ")
                .append(displayName(upload.getUploadedBy()))
                .append(" on ")
                .append(formatter.format(upload.getUploadedAt()))
                .append(upload.getDescription() != null ? ". Note: " + upload.getDescription() : "")
                .append('\n'));
        }
        byte[] bytes = builder.toString().getBytes(StandardCharsets.UTF_8);
        String fileName = buildChainFileName(topic);
        return new KnowledgeChainExport(fileName, bytes, "text/markdown");
    }

    @Transactional(readOnly = true)
    public KnowledgeTopicUpload fetchUpload(String topicId, String uploadId, String username) {
        AppUser user = requireUser(username);
        KnowledgeTopic topic = requireTopic(topicId);
        assertMembership(topic, user);
        return uploadRepository.findByIdAndTopicId(uploadId, topic.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Upload not found"));
    }

    private KnowledgeTopicSummaryResponse toSummary(KnowledgeTopic topic, AppUser user) {
        String topicId = topic.getId();
        boolean starred = starRepository.existsByTopicIdAndUserId(topicId, user.getId());
        int memberCount = memberRepository.countByTopicId(topicId);
        int contributionCount = contributionRepository.countByTopicId(topicId);
        int starCount = starRepository.countByTopicId(topicId);
        int linkCount = documentLinkRepository.countByTopicId(topicId);
        return new KnowledgeTopicSummaryResponse(
            topic.getId(),
            topic.getTitle(),
            topic.getDescription(),
            List.copyOf(topic.getTags()),
            topic.getCreatedBy() != null ? displayName(topic.getCreatedBy()) : "Unknown",
            topic.getCreatedAt(),
            topic.getUpdatedAt(),
            memberCount,
            contributionCount,
            starCount,
            linkCount,
            starred
        );
    }

    private KnowledgeTopicDetailsResponse toDetails(KnowledgeTopic topic, AppUser user) {
        String topicId = topic.getId();
        boolean member = memberRepository.existsByTopicIdAndUserId(topicId, user.getId());
        boolean starred = starRepository.existsByTopicIdAndUserId(topicId, user.getId());
        int memberCount = memberRepository.countByTopicId(topicId);
        int contributionCount = contributionRepository.countByTopicId(topicId);
        int starCount = starRepository.countByTopicId(topicId);
        int linkCount = documentLinkRepository.countByTopicId(topicId);

        List<KnowledgeContributionResponse> contributions = contributionRepository.findByTopicIdOrderByCreatedAtDesc(topicId).stream()
            .map(this::toContributionResponse)
            .toList();
        List<KnowledgeMemberResponse> members = memberRepository.findByTopicIdOrderByJoinedAtAsc(topicId).stream()
            .map(this::toMemberResponse)
            .toList();
        List<KnowledgeDocumentLinkResponse> links = documentLinkRepository.findByTopicIdOrderByLinkedAtDesc(topicId).stream()
            .map(this::toDocumentLinkResponse)
            .toList();
        List<KnowledgeAttachmentResponse> uploads = uploadRepository.findByTopicIdOrderByUploadedAtDesc(topicId).stream()
            .map(this::toAttachmentResponse)
            .toList();
        List<KnowledgeShareResponse> shares = shareRepository.findByTopicIdOrderBySharedAtDesc(topicId).stream()
            .map(this::toShareResponse)
            .toList();

        return new KnowledgeTopicDetailsResponse(
            topic.getId(),
            topic.getTitle(),
            topic.getDescription(),
            List.copyOf(topic.getTags()),
            topic.getCreatedBy() != null ? displayName(topic.getCreatedBy()) : "Unknown",
            topic.getCreatedAt(),
            topic.getUpdatedAt(),
            memberCount,
            contributionCount,
            starCount,
            linkCount,
            member,
            starred,
            contributions,
            members,
            links,
            uploads,
            shares
        );
    }

    private KnowledgeContributionResponse toContributionResponse(KnowledgeContribution contribution) {
        return new KnowledgeContributionResponse(
            contribution.getId(),
            displayName(contribution.getAuthor()),
            contribution.getContent(),
            contribution.getCreatedAt(),
            contribution.getLinkedDocumentId(),
            contribution.getLinkedDocumentTitle()
        );
    }

    private KnowledgeMemberResponse toMemberResponse(KnowledgeTopicMember member) {
        return new KnowledgeMemberResponse(
            member.getUser() != null ? member.getUser().getId() : null,
            member.getUser() != null ? displayName(member.getUser()) : "Unknown",
            member.getJoinedAt()
        );
    }

    private KnowledgeDocumentLinkResponse toDocumentLinkResponse(KnowledgeTopicDocumentLink link) {
        return new KnowledgeDocumentLinkResponse(
            link.getId(),
            link.getDocumentId(),
            link.getDocumentTitle(),
            link.getNote(),
            displayName(link.getLinkedBy()),
            link.getLinkedAt()
        );
    }

    private KnowledgeAttachmentResponse toAttachmentResponse(KnowledgeTopicUpload upload) {
        return new KnowledgeAttachmentResponse(
            upload.getId(),
            upload.getFileName(),
            upload.getSize(),
            upload.getContentType(),
            upload.getDescription(),
            displayName(upload.getUploadedBy()),
            upload.getUploadedAt()
        );
    }

    private KnowledgeShareResponse toShareResponse(KnowledgeTopicShare share) {
        return new KnowledgeShareResponse(
            share.getId(),
            displayName(share.getSender()),
            displayName(share.getRecipient()),
            share.getMessage(),
            share.getSharedAt()
        );
    }

    private void createMembership(KnowledgeTopic topic, AppUser user, Instant joinedAt) {
        KnowledgeTopicMember member = new KnowledgeTopicMember();
        member.setTopicId(topic.getId());
        member.setUserId(user.getId());
        member.setJoinedAt(joinedAt);
        saveMember(member);
    }

    private void assertMembership(KnowledgeTopic topic, AppUser user) {
        if (!memberRepository.existsByTopicIdAndUserId(topic.getId(), user.getId())) {
            throw new KnowledgeOperationException("Join the topic before performing this action");
        }
    }

    private KnowledgeTopic requireTopic(String topicId) {
        try {
            return topicRepository.findById(topicId)
                .orElseThrow(() -> new ResourceNotFoundException("Knowledge topic not found"));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to retrieve knowledge topic", ex);
        }
    }

    private Document findDocument(String id) {
        try {
            return documentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        } catch (IOException ex) {
            throw new RuntimeException("Failed to retrieve document", ex);
        }
    }

    private AppUser requireUser(String username) {
        if (!StringUtils.hasText(username)) {
            throw new AccessDeniedException("Authentication required");
        }
        return appUserRepository.findByUsernameIgnoreCaseWithFallback(username)
            .orElseThrow(() -> new AccessDeniedException("User not found"));
    }

    private Page<KnowledgeTopic> findTopics(Pageable pageable) {
        try {
            return topicRepository.findAll(pageable);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to list knowledge topics", ex);
        }
    }

    private List<KnowledgeTopic> loadAllTopicsSorted(Sort sort) {
        List<KnowledgeTopic> all = new ArrayList<>();
        int page = 0;
        int size = 200;
        Sort resolvedSort = sort.isSorted() ? sort : Sort.by(Sort.Direction.DESC, "updatedAt");
        while (true) {
            Page<KnowledgeTopic> batch = findTopics(PageRequest.of(page, size, resolvedSort));
            all.addAll(batch.getContent());
            if (batch.isLast()) {
                break;
            }
            page += 1;
        }
        return all;
    }

    private boolean matchesTopicQuery(KnowledgeTopic topic, String normalizedQuery) {
        if (!StringUtils.hasText(normalizedQuery)) {
            return true;
        }
        String needle = normalizedQuery.toLowerCase(Locale.ROOT);
        String title = topic.getTitle() == null ? "" : topic.getTitle().toLowerCase(Locale.ROOT);
        String description = topic.getDescription() == null ? "" : topic.getDescription().toLowerCase(Locale.ROOT);
        boolean tagMatch = topic.getTags() != null && topic.getTags().stream()
            .filter(StringUtils::hasText)
            .map(tag -> tag.toLowerCase(Locale.ROOT))
            .anyMatch(tag -> tag.contains(needle));
        if (title.contains(needle) || description.contains(needle) || tagMatch) {
            return true;
        }

        // Match contextual evidence so topic discovery works when keywords are present in linked docs/contributions.
        boolean linkMatch = documentLinkRepository.findByTopicId(topic.getId()).stream().anyMatch(link ->
            containsIgnoreCase(link.getDocumentTitle(), needle)
                || containsIgnoreCase(link.getNote(), needle)
                || containsIgnoreCase(link.getDocumentId(), needle)
        );
        if (linkMatch) {
            return true;
        }

        return contributionRepository.findByTopicId(topic.getId()).stream().anyMatch(entry ->
            containsIgnoreCase(entry.getContent(), needle)
                || containsIgnoreCase(entry.getLinkedDocumentTitle(), needle)
                || containsIgnoreCase(entry.getLinkedDocumentId(), needle)
        );
    }

    private boolean containsIgnoreCase(String value, String lowercaseNeedle) {
        return StringUtils.hasText(value) && value.toLowerCase(Locale.ROOT).contains(lowercaseNeedle);
    }

    private Optional<AppUser> findUserByUsername(String username) {
        return appUserRepository.findByUsernameIgnoreCaseWithFallback(username);
    }

    private KnowledgeTopic saveTopic(KnowledgeTopic topic) {
        try {
            return topicRepository.save(topic);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save knowledge topic", ex);
        }
    }

    private KnowledgeContribution saveContribution(KnowledgeContribution contribution) {
        try {
            return contributionRepository.save(contribution);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save contribution", ex);
        }
    }

    private KnowledgeTopicShare saveShare(KnowledgeTopicShare share) {
        try {
            return shareRepository.save(share);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save share", ex);
        }
    }

    private KnowledgeTopicStar saveStar(KnowledgeTopicStar star) {
        try {
            return starRepository.save(star);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save star", ex);
        }
    }

    private KnowledgeTopicDocumentLink saveDocumentLink(KnowledgeTopicDocumentLink link) {
        try {
            return documentLinkRepository.save(link);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save linked document", ex);
        }
    }

    private KnowledgeTopicUpload saveUpload(KnowledgeTopicUpload upload) {
        try {
            return uploadRepository.save(upload);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save upload", ex);
        }
    }

    private KnowledgeTopicMember saveMember(KnowledgeTopicMember member) {
        try {
            return memberRepository.save(member);
        } catch (IOException ex) {
            throw new RuntimeException("Failed to save member", ex);
        }
    }

    private Set<String> normalizeTags(Collection<String> tags) {
        if (tags == null) {
            return Set.of();
        }
        return tags.stream()
            .filter(StringUtils::hasText)
            .map(tag -> tag.trim().toLowerCase(Locale.US))
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private Set<String> normalizeUsernames(Collection<String> usernames) {
        if (usernames == null) {
            return Set.of();
        }
        return usernames.stream()
            .filter(StringUtils::hasText)
            .map(username -> username.trim())
            .filter(StringUtils::hasText)
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private String displayName(AppUser user) {
        if (user == null) {
            return "Unknown";
        }
        return StringUtils.hasText(user.getDisplayName()) ? user.getDisplayName() : user.getUsername();
    }

    private String buildChainFileName(KnowledgeTopic topic) {
        String base = topic.getTitle() != null ? topic.getTitle().toLowerCase(Locale.US) : "knowledge";
        base = base.replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (!StringUtils.hasText(base)) {
            base = "knowledge-topic";
        }
        return base + "-chain.md";
    }
}
