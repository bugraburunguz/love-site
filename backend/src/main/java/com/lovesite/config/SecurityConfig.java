package com.lovesite.config;

import com.lovesite.storage.StorageProperties;
import com.lovesite.user.AppUserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.HeaderWriter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, StorageProperties storage, com.lovesite.mobile.MobileProperties mobile) throws Exception {
        http
                // the store apps call the API from their own origins (capacitor://localhost, https://localhost)
                .cors(cors -> cors.configurationSource(mobileCors(mobile)))
                .headers(headers -> headers
                        // written by hand so the value is exactly "max-age=31536000; includeSubDomains" (Spring's own
                        // writer puts a space before the semicolon); only sent on HTTPS requests
                        .httpStrictTransportSecurity(hsts -> hsts.disable())
                        .addHeaderWriter(new StrictTransportSecurityWriter())
                        .referrerPolicy(referrer -> referrer.policy(ReferrerPolicy.NO_REFERRER))
                        .contentSecurityPolicy(csp -> csp.policyDirectives(contentSecurityPolicy(storage.bucketOrigin()))))
                // SPA: the token lives in the XSRF-TOKEN cookie and the frontend echoes it in X-XSRF-TOKEN.
                // The plain (non-XOR) handler accepts the raw cookie value, and CsrfCookieFilter forces
                // the deferred token to load so the cookie is written even on responses that never read it.
                // App requests (X-Client: love-site-app) are authenticated only by the X-Auth-Token header, never by the cookie
                // (MobileSessionConfig), and a page of another site cannot send that header cross-origin without passing CORS,
                // which only allows the app origins. Nothing ambient to forge, so no CSRF token for them.
                .csrf(csrf -> csrf
                        .ignoringRequestMatchers(com.lovesite.mobile.MobileSessionConfig::isApp)
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
                .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/login", "/api/auth/logout", "/api/auth/me").permitAll()
                        // invitation lookup/accept are public (the token is the credential); everything else under /api needs a session
                        .requestMatchers("/api/invites/**").permitAll()
                        // the privacy / account-deletion pages are public (store listings link to them)
                        .requestMatchers("/api/legal").permitAll()
                        .requestMatchers("/actuator/health","/actuator/health/**").permitAll()
                        .requestMatchers("/actuator/**").denyAll()
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll())
                .exceptionHandling(ex -> ex.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable);
        return http.build();
    }

    /**
     * Everything comes from this origin, plus the bucket for presigned uploads and downloads. No inline style or script
     * is needed: React sets styles through the CSSOM (not allowed to be blocked by style-src) and every texture is a
     * real file, so neither 'unsafe-inline' nor data: is required.
     *
     * script-src adds 'wasm-unsafe-eval' only because the upload screen hashes files with hash-wasm (WebAssembly);
     * without it every upload fails. It permits WebAssembly compilation, not eval() of strings.
     */
    static String contentSecurityPolicy(String bucketOrigin) {
        String bucket = bucketOrigin.isEmpty() ? "" : " " + bucketOrigin;
        return "default-src 'self'; "
                + "script-src 'self' 'wasm-unsafe-eval'; "
                + "img-src 'self' blob:" + bucket + "; "
                + "media-src 'self' blob:" + bucket + "; "
                + "connect-src 'self'" + bucket + "; "
                + "font-src 'self'; "
                + "style-src 'self'; "
                + "frame-ancestors 'none'; "
                + "base-uri 'self'; form-action 'self'; object-src 'none'";
    }

    /** CORS only for the API and only for the app origins; the website itself is same-origin and needs none. */
    static org.springframework.web.cors.CorsConfigurationSource mobileCors(com.lovesite.mobile.MobileProperties mobile) {
        var config = new org.springframework.web.cors.CorsConfiguration();
        config.setAllowedOrigins(mobile.origins());
        config.setAllowedMethods(java.util.List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(java.util.List.of("Content-Type", "Accept", com.lovesite.mobile.MobileProperties.CLIENT_HEADER,
                com.lovesite.mobile.MobileProperties.TOKEN_HEADER));
        config.setExposedHeaders(java.util.List.of(com.lovesite.mobile.MobileProperties.TOKEN_HEADER));
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);
        var source = new org.springframework.web.cors.UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    UserDetailsService userDetailsService(AppUserRepository users) {
        return email -> users.findByEmailIgnoreCase(email)
                .map(u -> User.withUsername(u.getEmail()).password(u.getPasswordHash()).authorities("ROLE_USER").build())
                .orElseThrow(() -> new UsernameNotFoundException("Unknown user"));
    }

    @Bean
    AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    private static final class StrictTransportSecurityWriter implements HeaderWriter {
        @Override
        public void writeHeaders(HttpServletRequest request, HttpServletResponse response) {
            if (request.isSecure() && !response.containsHeader("Strict-Transport-Security")) {
                response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
            }
        }
    }

    private static final class CsrfCookieFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            CsrfToken token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
            // the store app uses no CSRF token, so it gets no XSRF-TOKEN cookie either
            if (token != null && !com.lovesite.mobile.MobileSessionConfig.isApp(request)) {
                token.getToken();
            }
            chain.doFilter(request, response);
        }
    }
}
