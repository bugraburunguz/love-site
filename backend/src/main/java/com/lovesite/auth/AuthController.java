package com.lovesite.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import com.lovesite.ratelimit.RateLimitProperties;
import com.lovesite.ratelimit.RateLimiter;
import com.lovesite.system.ApiException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final RateLimiter limiter;
    private final RateLimitProperties limits;

    public AuthController(AuthService authService, RateLimiter limiter, RateLimitProperties limits) {
        this.authService = authService;
        this.limiter = limiter;
        this.limits = limits;
    }

    @PostMapping("/login")
    public UserResponse login(@Valid @RequestBody LoginRequest login, HttpServletRequest request,
                              HttpServletResponse response) {
        // per address, whatever e-mail is tried; the per-e-mail lock in AuthService covers one account from many addresses
        limiter.check("login-ip:" + ClientIp.of(request), limits.loginPerIp(), limits.loginWindow());
        return authService.login(login, request, response);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request) {
        authService.logout(request);
    }

    @GetMapping("/me")
    public UserResponse me(Authentication authentication) {
        if (authentication == null || authentication instanceof AnonymousAuthenticationToken
                || !authentication.isAuthenticated()) {
            throw ApiException.unauthorized("Giriş yapılmadı");
        }
        return authService.me(authentication);
    }
}
