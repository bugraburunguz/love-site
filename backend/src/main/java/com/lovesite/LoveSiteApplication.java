package com.lovesite;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class LoveSiteApplication {

    public static void main(String[] args) {
        SpringApplication.run(LoveSiteApplication.class, args);
    }
}
