package com.dms.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import com.dms.chatbot.config.DeepSeekProperties;
import com.dms.extraction.config.ExtractionApiProperties;
import com.dms.ocr.config.DotsOcrProperties;

@Configuration
@EnableConfigurationProperties({DeepSeekProperties.class, DotsOcrProperties.class, ExtractionApiProperties.class})
public class AiConfiguration {
}
