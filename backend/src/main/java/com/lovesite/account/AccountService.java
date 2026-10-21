package com.lovesite.account;

import com.lovesite.backup.PurgeLog;
import com.lovesite.space.TrashPurgeJob;
import com.lovesite.storage.StorageService;
import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * "Delete my account" from the shelf (web and store apps). The last member of a space takes the whole space with them:
 * albums, media, songs, exports, calendar and every bucket object, the originals' backup copies 30 days later through the
 * purge log. A member whose partner stays only leaves: the content stays in the space, the partner becomes its owner and
 * of the leaving user only their own diary lines go. Either way every session of the user ends.
 */
@Service
public class AccountService {

    private static final Logger log = LoggerFactory.getLogger(AccountService.class);

    public enum Outcome { SPACE_DELETED, LEFT_SPACE, NO_SPACE }

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final TrashPurgeJob purge;
    private final StorageService storage;
    private final TransactionTemplate tx;
    private final PurgeLog purgeLog;

    public AccountService(JdbcTemplate jdbc, PasswordEncoder passwords, TrashPurgeJob purge, StorageService storage,
                          TransactionTemplate tx, PurgeLog purgeLog) {
        this.purgeLog = purgeLog;
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.purge = purge;
        this.storage = storage;
        this.tx = tx;
    }

    public Outcome delete(CurrentUser me, String password) {
        // the operator's account creates spaces and invitations for everybody; it is not one of the couples' accounts
        if (me.admin()) throw ApiException.conflict("Platform yöneticisi hesabı uygulamadan silinemez.");
        String hash = jdbc.queryForObject("SELECT password_hash FROM app_user WHERE id = ?", String.class, me.userId());
        if (password == null || password.isEmpty() || hash == null || !passwords.matches(password, hash)) {
            throw ApiException.forbidden("Şifre hatalı");
        }
        UUID spaceId = me.spaceId();
        if (spaceId == null) {
            tx.executeWithoutResult(s -> deleteUser(me));
            log.info("Account {} deleted (no space)", me.userId());
            return Outcome.NO_SPACE;
        }

        // decided under a lock on the space, so two partners deleting at the same moment cannot both "leave" an empty space
        Boolean left = tx.execute(s -> {
            jdbc.queryForObject("SELECT id FROM space WHERE id = ? FOR UPDATE", UUID.class, spaceId);
            List<UUID> others = jdbc.queryForList("SELECT user_id FROM space_member WHERE space_id = ? AND user_id <> ? ORDER BY joined_at",
                    UUID.class, spaceId, me.userId());
            if (!others.isEmpty()) {
                leave(me, spaceId, others.get(0));
                deleteUser(me);
                return true;
            }
            // nobody may join a space that is going away, and a running export finds its row gone and removes its own files
            jdbc.update("DELETE FROM invitation WHERE space_id = ? AND used_at IS NULL", spaceId);
            jdbc.update("DELETE FROM export_job WHERE space_id = ?", spaceId);
            return false;
        });
        if (Boolean.TRUE.equals(left)) {
            log.info("Account {} deleted, it left space {} to its partner", me.userId(), spaceId);
            return Outcome.LEFT_SPACE;
        }

        Instant now = Instant.now();
        try {
            TrashPurgeJob.Result removed = purge.purgeSpace(spaceId, now);
            // whatever else lives under the space's prefix: export results, unconfirmed uploads, older variants
            for (String key : storage.list("spaces/" + spaceId + "/")) storage.delete(key);
            log.info("Purged space {} for account deletion: {} media item(s), {} album(s)", spaceId, removed.media(), removed.albums());
        } catch (RuntimeException e) {
            log.warn("Account deletion of {} stopped while removing the files of space {}: {}", me.userId(), spaceId, e.toString());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Hesap silinirken bir sorun oldu. Lütfen biraz sonra tekrar deneyin.");
        }
        tx.executeWithoutResult(s -> {
            // an upload confirmed while the files were being removed: its row goes too (its object went with the prefix)
            jdbc.queryForList("SELECT original_key FROM media WHERE space_id = ?", String.class, spaceId)
                    .forEach(key -> purgeLog.record(key, now));
            jdbc.update("DELETE FROM page_item WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM page WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM media WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM export_job WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM album WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM special_day WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM day_note WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM invitation WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM space_member WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM space WHERE id = ?", spaceId);
            deleteUser(me);
        });
        log.info("Account {} deleted together with space {}", me.userId(), spaceId);
        return Outcome.SPACE_DELETED;
    }

    /** The content stays in the space and is attributed to the partner; the leaving user's own diary lines go with them. */
    private void leave(CurrentUser me, UUID spaceId, UUID partner) {
        UUID id = me.userId();
        jdbc.update("UPDATE album SET created_by = ? WHERE created_by = ? AND space_id = ?", partner, id, spaceId);
        jdbc.update("UPDATE media SET uploaded_by = ? WHERE uploaded_by = ? AND space_id = ?", partner, id, spaceId);
        jdbc.update("UPDATE special_day SET created_by = ? WHERE created_by = ? AND space_id = ?", partner, id, spaceId);
        jdbc.update("UPDATE export_job SET requested_by = ? WHERE requested_by = ? AND space_id = ?", partner, id, spaceId);
        jdbc.update("DELETE FROM day_note WHERE author_id = ? AND space_id = ?", id, spaceId);
        jdbc.update("DELETE FROM invitation WHERE created_by = ? AND space_id = ? AND used_at IS NULL", id, spaceId);
        jdbc.update("UPDATE invitation SET created_by = ? WHERE created_by = ? AND space_id = ?", partner, id, spaceId);
        if (me.isOwner()) {
            jdbc.update("UPDATE space_member SET role = 'OWNER' WHERE space_id = ? AND user_id = ?", spaceId, partner);
        }
        jdbc.update("DELETE FROM space_member WHERE space_id = ? AND user_id = ?", spaceId, id);
    }

    /** The user row and every session of it (all devices, web and app); the seeder never recreates it. */
    private void deleteUser(CurrentUser me) {
        jdbc.update("UPDATE invitation SET used_by = NULL WHERE used_by = ?", me.userId());
        jdbc.update("DELETE FROM spring_session WHERE lower(principal_name) = lower(?)", me.email());
        jdbc.update("INSERT INTO deleted_account (email_sha256) VALUES (?) ON CONFLICT (email_sha256) DO UPDATE SET deleted_at = now()",
                emailHash(me.email()));
        jdbc.update("DELETE FROM app_user WHERE id = ?", me.userId());
    }

    public static String emailHash(String email) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(email.trim().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
