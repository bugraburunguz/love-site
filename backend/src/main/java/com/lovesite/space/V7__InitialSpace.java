package com.lovesite.space;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Attaches everything that exists before tenancy to one initial space, then makes space_id mandatory.
 * It needs the environment (initial space name and limit, which users go in, who is admin), so it is a Java
 * migration registered as a Spring bean.
 *
 * Fresh installs have no data yet: nothing is created here, and the startup seeder creates the initial space and
 * its two users from USER1_* / USER2_*.
 */
@Component
public class V7__InitialSpace extends BaseJavaMigration {

    private static final Logger log = LoggerFactory.getLogger(V7__InitialSpace.class);
    private static final long GIB = 1024L * 1024L * 1024L;

    private final Environment env;

    public V7__InitialSpace(Environment env) {
        this.env = env;
    }

    @Override
    public void migrate(Context context) throws Exception {
        Connection c = context.getConnection();

        long albums = count(c, "SELECT count(*) FROM album");
        long media = count(c, "SELECT count(*) FROM media");
        long users = count(c, "SELECT count(*) FROM app_user");

        if (albums + media + users > 0) {
            UUID space = createInitialSpace(c);
            attachUsers(c, space);
            try (Statement st = c.createStatement()) {
                st.executeUpdate("UPDATE album SET space_id = '" + space + "' WHERE space_id IS NULL");
                st.executeUpdate("UPDATE media SET space_id = '" + space + "' WHERE space_id IS NULL");
            }
            log.info("Attached {} album(s) and {} media item(s) to the initial space {}", albums, media, space);
        }

        String adminEmail = env.getProperty("app.admin-email", "").trim();
        if (!adminEmail.isEmpty()) {
            try (PreparedStatement ps = c.prepareStatement("UPDATE app_user SET is_admin = true WHERE lower(email) = lower(?)")) {
                ps.setString(1, adminEmail);
                ps.executeUpdate();
            }
        }

        try (Statement st = c.createStatement()) {
            st.execute("ALTER TABLE album ALTER COLUMN space_id SET NOT NULL");
            st.execute("ALTER TABLE media ALTER COLUMN space_id SET NOT NULL");
        }
    }

    private UUID createInitialSpace(Connection c) throws SQLException {
        String name = env.getProperty("app.space.initial-name", "Bizim Alanımız");
        double gb = Double.parseDouble(env.getProperty("app.space.initial-limit-gb", "400"));
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO space (id, name, storage_limit_bytes) VALUES (?, ?, ?)")) {
            ps.setObject(1, id);
            ps.setString(2, name);
            ps.setLong(3, (long) (gb * GIB));
            ps.executeUpdate();
        }
        return id;
    }

    /** USER1 becomes OWNER and USER2 MEMBER; without those variables the two oldest accounts are used. */
    private void attachUsers(Connection c, UUID space) throws SQLException {
        List<UUID> ordered = new ArrayList<>();
        for (String key : List.of("app.seed.user1.email", "app.seed.user2.email")) {
            String email = env.getProperty(key, "").trim();
            if (email.isEmpty()) continue;
            try (PreparedStatement ps = c.prepareStatement("SELECT id FROM app_user WHERE lower(email) = lower(?)")) {
                ps.setString(1, email);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) ordered.add(rs.getObject(1, UUID.class));
                }
            }
        }
        if (ordered.isEmpty()) {
            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT id FROM app_user ORDER BY created_at LIMIT 2")) {
                while (rs.next()) ordered.add(rs.getObject(1, UUID.class));
            }
        }
        for (int i = 0; i < ordered.size(); i++) {
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO space_member (space_id, user_id, role) VALUES (?, ?, ?)")) {
                ps.setObject(1, space);
                ps.setObject(2, ordered.get(i));
                ps.setString(3, i == 0 ? "OWNER" : "MEMBER");
                ps.executeUpdate();
            }
        }
    }

    private static long count(Connection c, String sql) throws SQLException {
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }
}
