package com.dms.document.controller;

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

import com.dms.document.dto.DocumentFolderRequest;
import com.dms.document.dto.DocumentFolderTreeNode;
import com.dms.document.dto.FolderPermissionUpdateRequest;
import com.dms.document.dto.FolderPermissionsResponse;
import com.dms.document.dto.FolderSelfPermissionResponse;
import com.dms.document.service.DocumentFolderService;
import com.dms.document.service.DocumentFolderPermissionService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/folders")
public class DocumentFolderController {

    private final DocumentFolderService folderService;
    private final DocumentFolderPermissionService permissionService;

    public DocumentFolderController(DocumentFolderService folderService,
            DocumentFolderPermissionService permissionService) {
        this.folderService = folderService;
        this.permissionService = permissionService;
    }

    @GetMapping("/tree")
    public List<DocumentFolderTreeNode> getTree() {
        return folderService.getTree();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentFolderTreeNode create(@RequestBody @Valid DocumentFolderRequest request) {
        return folderService.createFolder(request);
    }

    @PutMapping("/{folderId}")
    public DocumentFolderTreeNode update(@PathVariable String folderId, @RequestBody @Valid DocumentFolderRequest request) {
        return folderService.updateFolder(folderId, request);
    }

    @DeleteMapping("/{folderId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String folderId) {
        folderService.deleteFolder(folderId);
    }

    @GetMapping("/{folderId}/permissions")
    public FolderPermissionsResponse getPermissions(@PathVariable String folderId) {
        return permissionService.getPermissions(folderId);
    }

    @PutMapping("/{folderId}/permissions")
    public FolderPermissionsResponse updatePermissions(@PathVariable String folderId,
            @RequestBody FolderPermissionUpdateRequest request) {
        return permissionService.updatePermissions(folderId, request);
    }

    @GetMapping("/{folderId}/my-permissions")
    public FolderSelfPermissionResponse getMyPermissions(@PathVariable String folderId, java.security.Principal principal) {
        return permissionService.getMyPermissions(folderId, principal != null ? principal.getName() : null);
    }
}
