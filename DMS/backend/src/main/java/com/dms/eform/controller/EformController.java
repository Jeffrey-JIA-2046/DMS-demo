package com.dms.eform.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.dms.eform.dto.EformDefinitionResponse;
import com.dms.eform.service.EformDefinitionService;

@RestController
@RequestMapping("/api/eforms")
public class EformController {

    private final EformDefinitionService eformDefinitionService;

    public EformController(EformDefinitionService eformDefinitionService) {
        this.eformDefinitionService = eformDefinitionService;
    }

    @GetMapping("/{categoryCode}")
    public EformDefinitionResponse getByCategoryCode(@PathVariable String categoryCode) {
        return eformDefinitionService.getByCategoryCode(categoryCode);
    }
}
