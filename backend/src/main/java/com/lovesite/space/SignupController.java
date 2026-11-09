package com.lovesite.space;

import com.lovesite.auth.AuthService;
import com.lovesite.auth.ClientIp;
import com.lovesite.auth.UserResponse;
import com.lovesite.system.ApiException;
import com.lovesite.user.AppUser;
import com.lovesite.user.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Public signup (GET/POST /api/signup) and the admin's view of the free pool. */
@RestController
public class SignupController {

    public record SignupRequest(
            @NotBlank(message = "Ad gerekli") @Size(max = 60, message = "Ad en fazla 60 karakter olabilir") String displayName,
            @NotBlank(message = "E-posta gerekli") @Email(message = "Geçerli bir e-posta girin")
            @Size(max = 254, message = "E-posta çok uzun") String email,
            @NotBlank(message = "Şifre gerekli") @Size(min = 10, max = 200, message = "Şifre en az 10 karakter olmalı") String password,
            @AssertTrue(message = "Gizlilik politikasını onaylaman gerekiyor") boolean acceptPrivacy) {
    }

    private final SignupService signups;
    private final AuthService authService;
    private final com.lovesite.user.CurrentUserService currentUser;

    public SignupController(SignupService signups, AuthService authService, com.lovesite.user.CurrentUserService currentUser) {
        this.signups = signups;
        this.authService = authService;
        this.currentUser = currentUser;
    }

    @GetMapping("/api/signup")
    public SignupService.Status status() {
        return signups.status();
    }

    /** Creates the account and its free space, then signs the new user in. */
    @PostMapping("/api/signup")
    public UserResponse signup(@Valid @RequestBody SignupRequest body, Authentication authentication,
                               HttpServletRequest request, HttpServletResponse response) {
        if (authentication != null && !(authentication instanceof AnonymousAuthenticationToken) && authentication.isAuthenticated()) {
            throw ApiException.conflict("Yeni hesap açmak için önce çıkış yapın");
        }
        AppUser user = signups.signup(ClientIp.of(request), body.displayName(), body.email(), body.password());
        Authentication session = UsernamePasswordAuthenticationToken.authenticated(user.getEmail(), null,
                List.of(new SimpleGrantedAuthority("ROLE_USER")));
        authService.establishSession(session, request, response);
        return UserResponse.from(currentUser.require(session));
    }

    @GetMapping("/api/admin/signup")
    public SignupService.Summary summary(CurrentUser me) {
        me.requireAdmin();
        return signups.summary();
    }
}
