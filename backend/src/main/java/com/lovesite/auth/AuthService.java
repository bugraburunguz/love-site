package com.lovesite.auth;

import com.lovesite.user.AppUser;
import com.lovesite.user.AppUserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final AppUserRepository users;
    private final LoginAttemptService attempts;
    private final SecurityContextRepository securityContextRepository = new HttpSessionSecurityContextRepository();
    private final SessionFixationProtectionStrategy sessionStrategy = new SessionFixationProtectionStrategy();

    public AuthService(AuthenticationManager authenticationManager, AppUserRepository users,
                       LoginAttemptService attempts) {
        this.authenticationManager = authenticationManager;
        this.users = users;
        this.attempts = attempts;
    }

    public UserResponse login(LoginRequest login, HttpServletRequest request, HttpServletResponse response) {
        String email = login.email().trim();
        if (attempts.isLocked(email)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many failed attempts, try again later");
        }

        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(email, login.password()));
        } catch (AuthenticationException e) {
            attempts.recordFailure(email);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        attempts.recordSuccess(email);

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        sessionStrategy.onAuthentication(authentication, request, response);
        securityContextRepository.saveContext(context, request, response);

        return UserResponse.from(find(authentication.getName()));
    }

    public UserResponse me(Authentication authentication) {
        return UserResponse.from(find(authentication.getName()));
    }

    public void logout(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
    }

    private AppUser find(String email) {
        return users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }
}
