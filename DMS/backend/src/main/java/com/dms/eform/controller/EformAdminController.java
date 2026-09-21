package com.dms.eform.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.dms.eform.dto.EformDefinitionRequest;
import com.dms.eform.dto.EformDefinitionResponse;
import com.dms.eform.service.EformDefinitionService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin/eforms")
public class EformAdminController {

    private final EformDefinitionService eformDefinitionService;

    public EformAdminController(EformDefinitionService eformDefinitionService) {
        this.eformDefinitionService = eformDefinitionService;
    }

    @GetMapping
    public List<EformDefinitionResponse> listDefinitions() {
        return eformDefinitionService.listDefinitions();
    }

    @GetMapping("/{categoryCode}")
    public EformDefinitionResponse getByCategoryCode(@PathVariable String categoryCode) {
        return eformDefinitionService.getByCategoryCode(categoryCode);
    }

    @PutMapping("/{categoryCode}")
    public EformDefinitionResponse upsert(
        @PathVariable String categoryCode,
        @RequestBody @Valid EformDefinitionRequest request,
        java.security.Principal principal
    ) {
        EformDefinitionRequest payload = new EformDefinitionRequest(
            categoryCode,
            request.categoryLabel(),
            request.schema()
        );
        return eformDefinitionService.upsert(payload, principal != null ? principal.getName() : "system");
    }

    @DeleteMapping("/{categoryCode}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteByCategoryCode(@PathVariable String categoryCode) {
        eformDefinitionService.deleteByCategoryCode(categoryCode);
    }
}
