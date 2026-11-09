package com.lovesite.space;

import com.lovesite.ratelimit.RateLimiter;
import com.lovesite.system.ApiException;
import com.lovesite.user.AppUser;
import com.lovesite.user.AppUserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Locale;
import java.util.UUID;

/**
 * Public signup: the new user becomes the owner of a FREE space of their own and may invite a partner into it like
 * every owner. A transaction-scoped advisory lock serialises signups, so two requests can never both take the last
 * room of the free pool.
 */
@Service
public class SignupService {

    public static final String SIGNUP_CLOSED = "SIGNUP_CLOSED";
    static final String CLOSED_MESSAGE = "Şu an yeni kayıt alınmıyor. Davet bağlantın varsa onunla katılabilirsin.";
    private static final long LOCK_KEY = 0x4c535f5349474e55L; // "LS_SIGNU"

    /** What the public signup page needs to know before showing the form. */
    public record Status(boolean open, long freeLimitBytes) {
    }

    /** What the admin sees about the free pool. */
    public record Summary(boolean enabled, boolean open, int freeSpaces, long freeLimitBytes, long freeTotalBytes) {
    }

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final SignupProperties properties;
    private final SpaceProperties spaceProperties;
    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final RateLimiter rateLimiter;

    public SignupService(JdbcTemplate jdbc, TransactionTemplate tx, SignupProperties properties, SpaceProperties spaceProperties,
                         AppUserRepository users, PasswordEncoder passwordEncoder, RateLimiter rateLimiter) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.properties = properties;
        this.spaceProperties = spaceProperties;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.rateLimiter = rateLimiter;
    }

    public Status status() {
        return new Status(open(freeSpaces()), properties.freeLimit().toBytes());
    }

    public Summary summary() {
        int free = freeSpaces();
        return new Summary(properties.enabled(), open(free), free, properties.freeLimit().toBytes(), properties.freeTotal().toBytes());
    }

    /** Creates the account and its free space in one transaction. */
    public AppUser signup(String clientIp, String displayName, String email, String password) {
        rateLimiter.check("signup-ip:" + network(clientIp), properties.perIp(), properties.window());
        rateLimiter.check("signup-all", properties.perDay(), java.time.Duration.ofDays(1));
        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
        try {
            return tx.execute(status -> {
                jdbc.queryForObject("SELECT pg_advisory_xact_lock(?)", Object.class, LOCK_KEY);
                if (!open(freeSpaces())) throw closed();
                if (users.findByEmailIgnoreCase(normalizedEmail).isPresent()) {
                    throw ApiException.conflict("Bu e-posta adresi kullanılamıyor");
                }
                AppUser created = users.saveAndFlush(new AppUser(normalizedEmail, displayName.trim(), passwordEncoder.encode(password)));
                UUID spaceId = UUID.randomUUID();
                jdbc.update("INSERT INTO space (id, name, storage_limit_bytes, kind) VALUES (?, ?, ?, 'FREE')",
                        spaceId, spaceProperties.initialName(), properties.freeLimit().toBytes());
                jdbc.update("INSERT INTO space_member (space_id, user_id, role) VALUES (?, ?, 'OWNER')", spaceId, created.getId());
                return created;
            });
        } catch (DataIntegrityViolationException e) {
            throw ApiException.conflict("Bu e-posta adresi kullanılamıyor");
        }
    }

    /**
     * The unit a caller controls: an IPv4 address, or the /64 network of an IPv6 address (one home or server usually
     * gets a whole /64, so counting single IPv6 addresses would let it sign up endlessly).
     */
    static String network(String clientIp) {
        if (clientIp == null || clientIp.indexOf(':') < 0) return String.valueOf(clientIp);
        try {
            // a literal is parsed without any DNS lookup
            byte[] bytes = java.net.InetAddress.getByName(clientIp).getAddress();
            if (bytes.length != 16) return clientIp;
            return java.util.HexFormat.of().formatHex(bytes, 0, 8) + "::/64";
        } catch (java.net.UnknownHostException e) {
            return clientIp;
        }
    }

    private boolean open(int freeSpaces) {
        long limit = properties.freeLimit().toBytes();
        return properties.enabled() && (freeSpaces + 1L) * limit <= properties.freeTotal().toBytes();
    }

    private int freeSpaces() {
        return jdbc.queryForObject("SELECT count(*) FROM space WHERE kind = 'FREE'", Integer.class);
    }

    private static ApiException closed() {
        return new ApiException(HttpStatus.CONFLICT, CLOSED_MESSAGE, SIGNUP_CLOSED);
    }
}
