package com.lovesite;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class LoveSiteApplication {

    public static void main(String[] args) {
        SpringApplication.run(LoveSiteApplication.class, args);
    }
}
