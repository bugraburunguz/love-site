package com.lovesite.space;

import com.lovesite.auth.AuthService;
import com.lovesite.auth.ClientIp;
import com.lovesite.auth.UserResponse;
import com.lovesite.system.ApiException;
import com.lovesite.user.AppUser;
import com.lovesite.user.CurrentUser;
import com.lovesite.user.CurrentUserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Public (no session needed): the token in the link is the credential. */
@RestController
@RequestMapping("/api/invites")
public class InviteController {

    public record AcceptRequest(
            @NotBlank(message = "Ad gerekli") @Size(max = 60, message = "Ad en fazla 60 karakter olabilir") String displayName,
            @NotBlank(message = "E-posta gerekli") @Email(message = "Geçerli bir e-posta girin")
            @Size(max = 254, message = "E-posta çok uzun") String email,
            @NotBlank(message = "Şifre gerekli") @Size(min = 10, max = 200, message = "Şifre en az 10 karakter olmalı") String password) {
    }

    private final InvitationService invitations;
    private final AuthService authService;
    private final CurrentUserService currentUser;

    public InviteController(InvitationService invitations, AuthService authService, CurrentUserService currentUser) {
        this.invitations = invitations;
        this.authService = authService;
        this.currentUser = currentUser;
    }

    @GetMapping("/{token}")
    public InvitationService.Preview preview(@PathVariable String token, HttpServletRequest request) {
        return invitations.preview(token, ClientIp.of(request));
    }

    /** Creates the account, joins the space and signs the new user in. */
    @PostMapping("/{token}/accept")
    public UserResponse accept(@PathVariable String token, @Valid @RequestBody AcceptRequest body, Authentication authentication,
                               HttpServletRequest request, HttpServletResponse response) {
        if (authentication != null && !(authentication instanceof AnonymousAuthenticationToken) && authentication.isAuthenticated()) {
            CurrentUser me = currentUser.require(authentication);
            throw ApiException.conflict(me.spaceId() != null ? "Zaten bir alana üyesin"
                    : "Daveti kabul etmek için önce çıkış yapın");
        }
        AppUser user = invitations.accept(token, ClientIp.of(request), body.displayName(), body.email(), body.password());
        Authentication session = UsernamePasswordAuthenticationToken.authenticated(user.getEmail(), null,
                List.of(new SimpleGrantedAuthority("ROLE_USER")));
        authService.establishSession(session, request, response);
        return UserResponse.from(currentUser.require(session));
    }
}
