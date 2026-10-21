package com.lovesite.account;

import com.lovesite.auth.AuthService;
import com.lovesite.ratelimit.RateLimiter;
import com.lovesite.user.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/** The signed-in user's own account. There is no user id in the URL: it is always the caller. */
@RestController
@RequestMapping("/api/account")
public class AccountController {

    /** wrong passwords on a session that is already open: a handful per quarter hour is plenty for a human */
    static final int DELETE_ATTEMPTS = 5;
    static final Duration DELETE_WINDOW = Duration.ofMinutes(15);

    public record DeleteRequest(String password) {
    }

    private final AccountService accounts;
    private final AuthService auth;
    private final RateLimiter limiter;

    public AccountController(AccountService accounts, AuthService auth, RateLimiter limiter) {
        this.accounts = accounts;
        this.auth = auth;
        this.limiter = limiter;
    }

    /** POST (not DELETE with a body) so every client sends the password; the web needs its CSRF token as for any write. */
    @PostMapping("/delete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(CurrentUser me, @RequestBody DeleteRequest body, HttpServletRequest request) {
        limiter.check("account-delete:" + me.userId(), DELETE_ATTEMPTS, DELETE_WINDOW);
        accounts.delete(me, body == null ? null : body.password());
        auth.logout(request);
    }
}
