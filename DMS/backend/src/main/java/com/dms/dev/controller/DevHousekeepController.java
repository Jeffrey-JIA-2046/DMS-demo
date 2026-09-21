package com.dms.dev.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class DevHousekeepController {

    @GetMapping({"/dev_housekeep_Job", "/dev_housekeep_Job/"})
    public String devHousekeepPage() {
        return "forward:/dev_housekeep_Job/index.html";
    }
}
