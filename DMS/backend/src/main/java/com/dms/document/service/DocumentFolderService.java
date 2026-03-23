package com.dms.document.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.dms.document.dto.DocumentFolderRequest;
import com.dms.document.dto.DocumentFolderTreeNode;
import com.dms.document.dto.FolderMetadataFieldDto;
import com.dms.document.dto.FolderMetadataFieldRequest;
import com.dms.document.model.DocumentFolder;
import com.dms.document.model.FolderMetadataField;
import com.dms.document.repository.DocumentRepository;
import com.dms.document.repository.DocumentFolderRepository;
import com.dms.exception.InvalidDocumentException;
import com.dms.exception.ResourceNotFoundException;

@Service
public class DocumentFolderService {

    private static final Pattern FIELD_KEY_PATTERN = Pattern.compile("^[A-Za-z][A-Za-z0-9_-]*$");
    private static final int MAX_TEMPLATE_FIELDS = 25;

    private final DocumentFolderRepository folderRepository;
    private final DocumentRepository documentRepository;

    public DocumentFolderService(DocumentFolderRepository folderRepository, DocumentRepository documentRepository) {
        this.folderRepository = folderRepository;
        this.documentRepository = documentRepository;
    }

    @Transactional(readOnly = true)
    public List<DocumentFolderTreeNode> getTree() {
        try {
            List<DocumentFolder> folders = folderRepository.findAll();
            Map<String, DocumentFolderTreeNode> nodeMap = new HashMap<>();
            for (DocumentFolder folder : folders) {
                nodeMap.put(folder.getId(), toTreeNode(folder, new ArrayList<>()));
            }

            List<DocumentFolderTreeNode> roots = new ArrayList<>();
            for (DocumentFolder folder : folders) {
                DocumentFolderTreeNode node = nodeMap.get(folder.getId());
                DocumentFolder parent = folder.getParent();
                if (parent == null) {
                    roots.add(node);
                } else {
                    var parentNode = nodeMap.get(parent.getId());
                    if (parentNode != null) {
                        parentNode.children().add(node);
                    }
                }
            }

            roots.sort((a, b) -> a.name().compareToIgnoreCase(b.name()));
            nodeMap.values().forEach(node -> node.children().sort((a, b) -> a.name().compareToIgnoreCase(b.name())));
            return roots;
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to retrieve folder tree", ex);
        }
    }

    @Transactional
    public DocumentFolderTreeNode createFolder(DocumentFolderRequest request) {
        try {
            String normalizedName = normalizeName(request.name());
            DocumentFolder parent = resolveParent(request.parentId());
            ensureUniqueWithinParent(parent, normalizedName, null);

            DocumentFolder folder = new DocumentFolder();
            folder.setName(normalizedName);
            folder.setParent(parent);
            folder.setMetadataTemplate(resolveTemplateForCreate(request, parent));

            DocumentFolder saved = folderRepository.save(folder);
            return toTreeNode(saved, List.of());
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to create folder", ex);
        }
    }

    @Transactional
    public DocumentFolderTreeNode updateFolder(String folderId, DocumentFolderRequest request) {
        try {
            DocumentFolder folder = folderRepository.findById(folderId)
                .orElseThrow(() -> new ResourceNotFoundException("Folder not found"));

            DocumentFolder newParent = resolveParent(request.parentId());
            validateParentAssignment(folder, newParent);

            String normalizedName = normalizeName(request.name());
            boolean parentChanged = !sameId(folder.getParent(), newParent);
            boolean nameChanged = !folder.getName().equalsIgnoreCase(normalizedName);
            if (parentChanged || nameChanged) {
                ensureUniqueWithinParent(newParent, normalizedName, folder.getId());
            }

            folder.setName(normalizedName);
            folder.setParent(newParent);
            folder.setMetadataTemplate(mapTemplate(request.metadataTemplate()));

            DocumentFolder saved = folderRepository.save(folder);
            return toTreeNode(saved, List.of());
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to update folder", ex);
        }
    }

    @Transactional
    public void deleteFolder(String folderId) {
        try {
            DocumentFolder folder = folderRepository.findById(folderId)
                .orElseThrow(() -> new ResourceNotFoundException("Folder not found"));

            List<DocumentFolder> allFolders = folderRepository.findAll();
            boolean hasChildren = allFolders.stream().anyMatch(existing -> {
                DocumentFolder parent = existing.getParent();
                return parent != null && folderId.equals(parent.getId());
            });
            if (hasChildren) {
                throw new InvalidDocumentException("Cannot delete a folder that still has subfolders");
            }

            boolean hasDocuments = documentRepository.findAll().stream().anyMatch(document -> {
                if (folderId.equals(document.getFolderId())) {
                    return true;
                }
                return document.getFolder() != null && folderId.equals(document.getFolder().getId());
            });
            if (hasDocuments) {
                throw new InvalidDocumentException("Cannot delete a folder that still contains documents");
            }

            folderRepository.deleteById(folder.getId());
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to delete folder", ex);
        }
    }

    private DocumentFolder resolveParent(String parentId) {
        if (parentId == null) {
            return null;
        }
        try {
            return folderRepository.findById(parentId)
                .orElseThrow(() -> new ResourceNotFoundException("Parent folder not found"));
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to retrieve parent folder", ex);
        }
    }

    private void ensureUniqueWithinParent(DocumentFolder parent, String name, String excludeId) {
        boolean exists = false;
        try {
            List<DocumentFolder> allFolders = folderRepository.findAll();

            for (DocumentFolder folder : allFolders) {
                if (excludeId != null && folder.getId().equals(excludeId)) {
                    continue;
                }

                DocumentFolder folderParent = folder.getParent();
                boolean parentMatches = (parent == null && folderParent == null) ||
                    (parent != null && folderParent != null && parent.getId().equals(folderParent.getId()));

                if (parentMatches && folder.getName().equalsIgnoreCase(name)) {
                    exists = true;
                    break;
                }
            }
        } catch (java.io.IOException ex) {
            throw new RuntimeException("Failed to validate folder uniqueness", ex);
        }

        if (exists) {
            throw new InvalidDocumentException("A folder with this name already exists in the selected location");
        }
    }

    private String normalizeName(String name) {
        if (!StringUtils.hasText(name)) {
            throw new InvalidDocumentException("Folder name is required");
        }
        String normalized = name.trim();
        if (!StringUtils.hasText(normalized)) {
            throw new InvalidDocumentException("Folder name is required");
        }
        if (normalized.length() > 120) {
            throw new InvalidDocumentException("Folder name must be 120 characters or fewer");
        }
        return normalized;
    }

    private DocumentFolderTreeNode toTreeNode(DocumentFolder folder, List<DocumentFolderTreeNode> children) {
        return new DocumentFolderTreeNode(
            folder.getId(),
            folder.getName(),
            folder.getParent() != null ? folder.getParent().getId() : null,
            children,
            toMetadataDtos(folder.getMetadataTemplate())
        );
    }

    private List<FolderMetadataFieldDto> toMetadataDtos(List<FolderMetadataField> template) {
        if (template == null || template.isEmpty()) {
            return List.of();
        }
        return template.stream()
            .map(field -> new FolderMetadataFieldDto(
                field.getKey(),
                field.getLabel(),
                field.getType(),
                field.isRequired(),
                field.getHint()
            ))
            .toList();
    }

    private List<FolderMetadataField> mapTemplate(List<FolderMetadataFieldRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return new ArrayList<>();
        }
        if (requests.size() > MAX_TEMPLATE_FIELDS) {
            throw new InvalidDocumentException("Metadata template is limited to " + MAX_TEMPLATE_FIELDS + " fields per folder");
        }

        List<FolderMetadataField> fields = new ArrayList<>();
        Set<String> normalizedKeys = new HashSet<>();
        for (FolderMetadataFieldRequest request : requests) {
            if (request == null) {
                throw new InvalidDocumentException("Metadata field definition cannot be null");
            }
            String key = normalizeFieldKey(request.key());
            String dedupeKey = key.toLowerCase(Locale.US);
            if (!normalizedKeys.add(dedupeKey)) {
                throw new InvalidDocumentException("Metadata key '" + key + "' is duplicated");
            }

            FolderMetadataField field = new FolderMetadataField();
            field.setKey(key);
            field.setLabel(normalizeFieldLabel(request.label()));
            field.setType(request.type());
            field.setRequired(request.required());
            field.setHint(normalizeHint(request.hint()));
            fields.add(field);
        }
        return fields;
    }

    private List<FolderMetadataField> resolveTemplateForCreate(DocumentFolderRequest request, DocumentFolder parent) {
        boolean inheritFromParent = Boolean.TRUE.equals(request.inheritMetadataTemplateFromParent());
        if (inheritFromParent) {
            if (parent == null) {
                throw new InvalidDocumentException("Cannot inherit metadata template without a parent folder");
            }
            return copyTemplate(parent.getMetadataTemplate());
        }
        return mapTemplate(request.metadataTemplate());
    }

    private List<FolderMetadataField> copyTemplate(List<FolderMetadataField> source) {
        if (source == null || source.isEmpty()) {
            return new ArrayList<>();
        }
        List<FolderMetadataField> copied = new ArrayList<>();
        for (FolderMetadataField field : source) {
            if (field == null) {
                continue;
            }
            FolderMetadataField clone = new FolderMetadataField();
            clone.setKey(field.getKey());
            clone.setLabel(field.getLabel());
            clone.setType(field.getType());
            clone.setRequired(field.isRequired());
            clone.setHint(field.getHint());
            copied.add(clone);
        }
        return copied;
    }

    private String normalizeFieldKey(String rawKey) {
        if (!StringUtils.hasText(rawKey)) {
            throw new InvalidDocumentException("Metadata key is required");
        }
        String key = rawKey.trim();
        if (!FIELD_KEY_PATTERN.matcher(key).matches()) {
            throw new InvalidDocumentException("Metadata key must start with a letter and contain only letters, numbers, underscores, or hyphens");
        }
        return key;
    }

    private String normalizeFieldLabel(String rawLabel) {
        if (!StringUtils.hasText(rawLabel)) {
            throw new InvalidDocumentException("Metadata label is required");
        }
        return rawLabel.trim();
    }

    private String normalizeHint(String rawHint) {
        if (!StringUtils.hasText(rawHint)) {
            return null;
        }
        return rawHint.trim();
    }

    private void validateParentAssignment(DocumentFolder folder, DocumentFolder newParent) {
        if (newParent == null) {
            return;
        }
        if (folder.getId().equals(newParent.getId())) {
            throw new InvalidDocumentException("A folder cannot be nested inside itself");
        }
        DocumentFolder cursor = newParent;
        while (cursor != null) {
            if (folder.getId().equals(cursor.getId())) {
                throw new InvalidDocumentException("A folder cannot be moved inside its own descendants");
            }
            cursor = cursor.getParent();
        }
    }

    private boolean sameId(DocumentFolder a, DocumentFolder b) {
        if (a == null && b == null) {
            return true;
        }
        if (a == null || b == null) {
            return false;
        }
        return a.getId().equals(b.getId());
    }
}
