package com.lovesite.role;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.catalina.connector.Connector;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * HTTP side of the roles.
 *
 * - Worker and all-in-one processes open a second connector bound to 127.0.0.1 only (`app.render.port`, default 8099).
 *   Chromium, running inside the same container, loads the SPA's render route and the render data from there. It cannot be
 *   reached from outside the container, whatever the platform's network looks like.
 * - The gate filter runs before everything else (Spring Security included):
 *   on the render port only the SPA files, `/render/**` and `/internal/render/**` exist;
 *   on the public port `/internal/**` and `/render/**` never exist, and a worker answers nothing but `/actuator/health/**`.
 *   Everything that does not exist is a bare 404.
 */
@Configuration
public class RoleWebConfig {

    private static final Logger log = LoggerFactory.getLogger(RoleWebConfig.class);
    public static final String LOOPBACK = "127.0.0.1";

    @Bean
    WebServerFactoryCustomizer<TomcatServletWebServerFactory> renderConnector(Roles roles, @Value("${app.render.port:8099}") int port) {
        return factory -> {
            if (!roles.runs(Roles.Job.RENDER_ENDPOINT)) return;
            Connector connector = new Connector(TomcatServletWebServerFactory.DEFAULT_PROTOCOL);
            connector.setPort(port);
            connector.setProperty("address", LOOPBACK);
            factory.addAdditionalConnectors(connector);
            log.info("Render endpoint listening on {}:{} (loopback only)", LOOPBACK, port);
        };
    }

    @Bean
    FilterRegistrationBean<RoleGateFilter> roleGateFilter(Roles roles, RenderPort port) {
        FilterRegistrationBean<RoleGateFilter> bean = new FilterRegistrationBean<>(new RoleGateFilter(roles, port));
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE);
        bean.addUrlPatterns("/*");
        return bean;
    }

    public static final class RoleGateFilter extends OncePerRequestFilter {
        private final Roles roles;
        private final RenderPort renderPort;

        RoleGateFilter(Roles roles, RenderPort renderPort) {
            this.roles = roles;
            this.renderPort = renderPort;
        }

        /** true when the request may go on; decided from the local port it arrived on, never from client-supplied headers */
        boolean allowed(HttpServletRequest request) {
            String path = request.getRequestURI().substring(request.getContextPath().length());
            boolean onRenderPort = roles.runs(Roles.Job.RENDER_ENDPOINT) && renderPort.actual() > 0 && request.getLocalPort() == renderPort.actual();
            if (onRenderPort) {
                return !path.startsWith("/api/") && !path.equals("/api") && !path.startsWith("/actuator");
            }
            if (path.startsWith("/internal/") || path.equals("/internal") || path.equals("/render") || path.startsWith("/render/")) return false;
            if (!roles.runs(Roles.Job.PUBLIC_API)) {
                return path.equals("/actuator/health") || path.startsWith("/actuator/health/");
            }
            return true;
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            if (!allowed(request)) {
                response.setStatus(HttpServletResponse.SC_NOT_FOUND);
                response.setContentLength(0);
                return;
            }
            chain.doFilter(request, response);
        }
    }
}
