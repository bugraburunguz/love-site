package com.lovesite.auth;

import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.SessionFixationProtectionStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final CurrentUserService currentUser;
    private final LoginAttemptService attempts;
    private final SecurityContextRepository securityContextRepository = new HttpSessionSecurityContextRepository();
    private final SessionFixationProtectionStrategy sessionStrategy = new SessionFixationProtectionStrategy();

    public AuthService(AuthenticationManager authenticationManager, CurrentUserService currentUser,
                       LoginAttemptService attempts) {
        this.authenticationManager = authenticationManager;
        this.currentUser = currentUser;
        this.attempts = attempts;
    }

    public UserResponse login(LoginRequest login, HttpServletRequest request, HttpServletResponse response) {
        String email = login.email().trim();
        if (attempts.isLocked(email)) {
            throw ApiException.tooManyRequests("Çok fazla hatalı deneme. Lütfen daha sonra tekrar deneyin.");
        }

        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(email, login.password()));
        } catch (AuthenticationException e) {
            attempts.recordFailure(email);
            throw ApiException.unauthorized("E-posta veya şifre hatalı");
        }
        attempts.recordSuccess(email);

        establishSession(authentication, request, response);
        return UserResponse.from(currentUser.require(authentication));
    }

    /** Puts the authentication into a fresh session (also used after an invitation was accepted). */
    public void establishSession(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        sessionStrategy.onAuthentication(authentication, request, response);
        securityContextRepository.saveContext(context, request, response);
    }

    public UserResponse me(Authentication authentication) {
        return UserResponse.from(currentUser.require(authentication));
    }

    public void logout(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
    }
}
