package com.lovesite.space;

import com.lovesite.auth.LoginAttemptService;
import com.lovesite.system.ApiException;
import com.lovesite.user.AppUser;
import com.lovesite.user.AppUserRepository;
import com.lovesite.user.CurrentUser;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Invitation links are the only way into the app: there is no public signup. The link carries a random token; only its
 * SHA-256 is stored, so a database leak does not leak usable links. Whatever is wrong with a token (unknown, expired,
 * used, space full) the caller sees the same generic answer, and repeated wrong guesses from one address are throttled.
 */
@Service
public class InvitationService {

    static final String GENERIC_INVALID = "Davet geçersiz ya da süresi dolmuş";

    public record Created(UUID spaceId, String token, String path, String url, Instant expiresAt) {
        // url is absolute when APP_PUBLIC_URL is configured, otherwise null and the client builds it from its own origin
    }

    public record Preview(String spaceName, String role, Instant expiresAt) {
    }

    private record Row(UUID id, UUID spaceId, String role, Instant expiresAt, Instant usedAt, String spaceName) {
    }

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final SpaceService spaces;
    private final SpaceProperties properties;
    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final LoginAttemptService throttle;
    private final com.lovesite.config.PublicUrlProperties publicUrl;
    private final SecureRandom random = new SecureRandom();

    public InvitationService(JdbcTemplate jdbc, TransactionTemplate tx, SpaceService spaces, SpaceProperties properties,
                             AppUserRepository users, PasswordEncoder passwordEncoder, LoginAttemptService throttle,
                             com.lovesite.config.PublicUrlProperties publicUrl) {
        this.publicUrl = publicUrl;
        this.jdbc = jdbc;
        this.tx = tx;
        this.spaces = spaces;
        this.properties = properties;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.throttle = throttle;
    }

    // ---- issuing

    /** Owner invites the partner. A new invite replaces (invalidates) the previous unused one of the space. */
    @Transactional
    public Created inviteMember(CurrentUser me) {
        me.requireOwner();
        UUID spaceId = me.requireSpace();
        lockSpace(spaceId);
        if (spaces.memberCount(spaceId) >= properties.maxMembers()) {
            throw ApiException.conflict("Alanınızda yeni üye için yer yok");
        }
        return issue(spaceId, "MEMBER", me.userId());
    }

    /** Admin: new space plus the invitation of its owner, in one step. */
    @Transactional
    public Created createSpaceWithOwnerInvite(CurrentUser admin, String name, double limitGb) {
        admin.requireAdmin();
        Space space = spaces.create(name, limitGb);
        return issue(space.getId(), "OWNER", admin.userId());
    }

    /** Admin: a fresh owner link for a space nobody has joined yet (e.g. the first one expired). */
    @Transactional
    public Created reissueOwnerInvite(CurrentUser admin, UUID spaceId) {
        admin.requireAdmin();
        Integer exists = jdbc.queryForObject("SELECT count(*) FROM space WHERE id = ?", Integer.class, spaceId);
        if (exists == null || exists == 0) throw ApiException.notFound("Alan bulunamadı");
        lockSpace(spaceId);
        Integer owners = jdbc.queryForObject("SELECT count(*) FROM space_member WHERE space_id = ? AND role = 'OWNER'",
                Integer.class, spaceId);
        if (owners != null && owners > 0) throw ApiException.conflict("Bu alanın zaten bir sahibi var");
        return issue(spaceId, "OWNER", admin.userId());
    }

    private Created issue(UUID spaceId, String role, UUID createdBy) {
        jdbc.update("UPDATE invitation SET expires_at = now() WHERE space_id = ? AND role = ? AND used_at IS NULL AND expires_at > now()",
                spaceId, role);
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant expiresAt = Instant.now().plus(properties.inviteTtl());
        jdbc.update("INSERT INTO invitation (token_hash, space_id, role, created_by, expires_at) VALUES (?, ?, ?, ?, ?)",
                hash(token), spaceId, role, createdBy, Timestamp.from(expiresAt));
        String path = "/invite/" + token;
        return new Created(spaceId, token, path, publicUrl.configured() ? publicUrl.publicUrl() + path : null, expiresAt);
    }

    // ---- redeeming (public)

    public Preview preview(String token, String clientIp) {
        guard(clientIp);
        Optional<Row> row = find(token, false).filter(this::usable);
        if (row.isEmpty()) {
            throttle.recordFailure(throttleKey(clientIp));
            throw ApiException.notFound(GENERIC_INVALID);
        }
        return new Preview(row.get().spaceName(), row.get().role(), row.get().expiresAt());
    }

    /** Creates the account, joins the space and burns the invitation, all in one transaction. */
    public AppUser accept(String token, String clientIp, String displayName, String email, String password) {
        guard(clientIp);
        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
        try {
            AppUser user = tx.execute(status -> {
                // lock order is always space -> invitation (inviteMember does the same), so concurrent issue/accept cannot deadlock
                Row peek = find(token, false).orElse(null);
                if (peek == null) return null;
                lockSpace(peek.spaceId());
                Row row = find(token, true).filter(this::usable).orElse(null);
                if (row == null) return null;

                if (users.findByEmailIgnoreCase(normalizedEmail).isPresent()) {
                    throw ApiException.conflict("Bu e-posta adresi kullanılamıyor");
                }
                AppUser created = users.saveAndFlush(new AppUser(normalizedEmail, displayName.trim(), passwordEncoder.encode(password)));
                jdbc.update("INSERT INTO space_member (space_id, user_id, role) VALUES (?, ?, ?)", row.spaceId(), created.getId(), row.role());
                jdbc.update("UPDATE invitation SET used_at = now(), used_by = ? WHERE id = ?", created.getId(), row.id());
                return created;
            });
            if (user == null) {
                throttle.recordFailure(throttleKey(clientIp));
                throw ApiException.notFound(GENERIC_INVALID);
            }
            throttle.recordSuccess(throttleKey(clientIp));
            return user;
        } catch (DataIntegrityViolationException e) {
            throw ApiException.conflict("Bu e-posta adresi kullanılamıyor");
        }
    }

    // ---- helpers

    private void guard(String clientIp) {
        if (throttle.isLocked(throttleKey(clientIp))) {
            throw ApiException.tooManyRequests("Çok fazla hatalı deneme. Lütfen daha sonra tekrar deneyin.");
        }
    }

    private static String throttleKey(String clientIp) {
        return "invite-ip:" + clientIp;
    }

    /** Not used, not expired, and the space still has room for the role (an owner link needs a space without owner). */
    private boolean usable(Row row) {
        if (row.usedAt() != null || !row.expiresAt().isAfter(Instant.now())) return false;
        if ("OWNER".equals(row.role())) {
            Integer owners = jdbc.queryForObject("SELECT count(*) FROM space_member WHERE space_id = ? AND role = 'OWNER'",
                    Integer.class, row.spaceId());
            return owners != null && owners == 0;
        }
        return spaces.memberCount(row.spaceId()) < properties.maxMembers();
    }

    private Optional<Row> find(String token, boolean forUpdate) {
        if (token == null || token.length() > 100) return Optional.empty();
        List<Row> rows = jdbc.query(
                "SELECT i.id, i.space_id, i.role, i.expires_at, i.used_at, s.name FROM invitation i JOIN space s ON s.id = i.space_id "
                        + "WHERE i.token_hash = ?" + (forUpdate ? " FOR UPDATE OF i" : ""),
                (rs, n) -> new Row(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3),
                        rs.getTimestamp(4).toInstant(), rs.getTimestamp(5) == null ? null : rs.getTimestamp(5).toInstant(),
                        rs.getString(6)),
                hash(token));
        return rows.stream().findFirst();
    }

    private void lockSpace(UUID spaceId) {
        jdbc.queryForObject("SELECT id FROM space WHERE id = ? FOR UPDATE", UUID.class, spaceId);
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
