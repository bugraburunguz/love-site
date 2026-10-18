package com.lovesite.role;

import org.apache.catalina.connector.Connector;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.tomcat.TomcatWebServer;
import org.springframework.boot.web.server.context.WebServerInitializedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * The port of the loopback render connector as it really is after startup (`app.render.port=0` picks a free one, which the
 * tests use). -1 while there is none (web role, or no embedded server at all).
 */
@Component
public class RenderPort {

    private final int configured;
    private volatile int actual = -1;

    public RenderPort(@Value("${app.render.port:8099}") int configured) {
        this.configured = configured;
    }

    @EventListener
    void onStarted(WebServerInitializedEvent event) {
        if (!(event.getWebServer() instanceof TomcatWebServer tomcat)) return;
        for (Connector c : tomcat.getTomcat().getService().findConnectors()) {
            Object address = c.getProperty("address");
            if (address != null && RoleWebConfig.LOOPBACK.equals(String.valueOf(address).replace("/", ""))) {
                actual = c.getLocalPort();
            }
        }
    }

    public int configured() {
        return configured;
    }

    /** -1 when there is no render connector in this process. */
    public int actual() {
        return actual;
    }

    public String baseUrl() {
        if (actual <= 0) throw new IllegalStateException("No render connector in this process");
        return "http://" + RoleWebConfig.LOOPBACK + ":" + actual;
    }
}
