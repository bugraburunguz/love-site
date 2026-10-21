package com.lovesite.account;

import com.lovesite.config.PublicUrlProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * What the public privacy and account-deletion pages need from the server: the contact address. PRIVACY_CONTACT_EMAIL wins;
 * without it the address is derived from APP_PUBLIC_URL (gizlilik@host, for a host with a dot), and without either the pages show none.
 */
@RestController
public class LegalController {

    public record LegalInfo(String contactEmail) {
    }

    private final LegalInfo info;

    public LegalController(@Value("${app.privacy.contact-email:}") String contactEmail, PublicUrlProperties publicUrl) {
        this.info = new LegalInfo(contactEmail(contactEmail, publicUrl));
    }

    static String contactEmail(String configured, PublicUrlProperties publicUrl) {
        if (configured != null && configured.trim().contains("@")) return configured.trim();
        // only for a real domain: "gizlilik@localhost" or "gizlilik@app" would be no address at all
        return publicUrl.configured() && publicUrl.host().contains(".") ? "gizlilik@" + publicUrl.host() : "";
    }

    @GetMapping("/api/legal")
    public LegalInfo legal() {
        return info;
    }
}
