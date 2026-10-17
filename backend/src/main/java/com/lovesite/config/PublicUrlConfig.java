package com.lovesite.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

@Configuration
public class PublicUrlConfig {

    private static final Logger log = LoggerFactory.getLogger(PublicUrlConfig.class);

    /** Runs right after the forwarded-header filter, so getServerName() is the public host Railway's proxy saw. */
    @Bean
    FilterRegistrationBean<PublicUrlRedirectFilter> publicUrlRedirectFilter(PublicUrlProperties properties) {
        FilterRegistrationBean<PublicUrlRedirectFilter> bean = new FilterRegistrationBean<>(new PublicUrlRedirectFilter(properties));
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        return bean;
    }

    @Bean
    ApplicationRunner publicUrlReport(PublicUrlProperties properties, @Value("${server.servlet.session.cookie.secure:true}") boolean cookieSecure) {
        return args -> {
            if (!properties.configured()) {
                log.info("APP_PUBLIC_URL not set: invite links use the address the owner browses from");
                return;
            }
            log.info("Public URL {} (redirect from platform host: {})", properties.publicUrl(), properties.redirectToPublicUrl());
            if (properties.https() && !cookieSecure) log.warn("APP_PUBLIC_URL is https but COOKIE_SECURE=false: session cookie is not marked Secure");
            if (!properties.https() && cookieSecure) log.warn("APP_PUBLIC_URL is http but COOKIE_SECURE=true: browsers will not send the session cookie back");
        };
    }
}
