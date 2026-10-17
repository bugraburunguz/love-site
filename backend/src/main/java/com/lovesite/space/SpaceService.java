package com.lovesite.space;

import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class SpaceService {

    public record Member(String displayName, String role) {
    }

    /** What a member sees about their own space. */
    public record SpaceInfo(UUID id, String name, String role, List<Member> members, long usedBytes, long limitBytes,
                            int maxMembers, boolean canInvite) {
    }

    /** What the platform admin sees: numbers and names only, never content. */
    public record AdminSpace(UUID id, String name, List<Member> members, long usedBytes, long limitBytes, Instant createdAt) {
    }

    private final SpaceRepository spaces;
    private final QuotaService quota;
    private final JdbcTemplate jdbc;
    private final SpaceProperties properties;

    public SpaceService(SpaceRepository spaces, QuotaService quota, JdbcTemplate jdbc, SpaceProperties properties) {
        this.spaces = spaces;
        this.quota = quota;
        this.jdbc = jdbc;
        this.properties = properties;
    }

    public SpaceInfo info(CurrentUser me) {
        UUID spaceId = me.requireSpace();
        Space space = spaces.findById(spaceId).orElseThrow(() -> ApiException.notFound("Alan bulunamadı"));
        List<Member> members = members(spaceId);
        boolean canInvite = me.isOwner() && members.size() < properties.maxMembers();
        return new SpaceInfo(space.getId(), space.getName(), me.role(), members, quota.usage(spaceId),
                space.getStorageLimitBytes(), properties.maxMembers(), canInvite);
    }

    public List<Member> members(UUID spaceId) {
        return jdbc.query("SELECT u.display_name, m.role FROM space_member m JOIN app_user u ON u.id = m.user_id "
                        + "WHERE m.space_id = ? ORDER BY CASE m.role WHEN 'OWNER' THEN 0 ELSE 1 END, m.joined_at",
                (rs, i) -> new Member(rs.getString(1), rs.getString(2)), spaceId);
    }

    public int memberCount(UUID spaceId) {
        return jdbc.queryForObject("SELECT count(*) FROM space_member WHERE space_id = ?", Integer.class, spaceId);
    }

    /** The first space ever created is the "initial" one (it may still use the old global music file). */
    public boolean isInitial(UUID spaceId) {
        List<UUID> first = jdbc.query("SELECT id FROM space ORDER BY created_at, id LIMIT 1", (rs, i) -> rs.getObject(1, UUID.class));
        return !first.isEmpty() && first.get(0).equals(spaceId);
    }

    // ---- admin

    public List<AdminSpace> adminList() {
        return spaces.findAll().stream()
                .sorted(Comparator.comparing(Space::getCreatedAt).reversed())
                .map(this::summary)
                .toList();
    }

    @Transactional
    public Space create(String name, double limitGb) {
        // flushed right away: the invitation insert that follows uses plain JDBC in the same transaction
        return spaces.saveAndFlush(new Space(name.trim(), toBytes(limitGb)));
    }

    @Transactional
    public AdminSpace update(UUID id, String name, Double limitGb) {
        Space space = spaces.findById(id).orElseThrow(() -> ApiException.notFound("Alan bulunamadı"));
        if (name != null && !name.isBlank()) space.setName(name.trim());
        if (limitGb != null) space.setStorageLimitBytes(toBytes(limitGb));
        return summary(spaces.save(space));
    }

    public Space get(UUID id) {
        return spaces.findById(id).orElseThrow(() -> ApiException.notFound("Alan bulunamadı"));
    }

    public AdminSpace summary(Space space) {
        return new AdminSpace(space.getId(), space.getName(), members(space.getId()), quota.usage(space.getId()),
                space.getStorageLimitBytes(), space.getCreatedAt());
    }

    private static long toBytes(double gb) {
        if (!(gb > 0) || gb > 100_000) throw ApiException.badRequest("Limit sıfırdan büyük olmalı");
        return (long) (gb * SpaceProperties.GIB);
    }
}
