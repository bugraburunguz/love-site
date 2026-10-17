package com.lovesite.user;

import com.lovesite.system.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

import java.util.List;
import java.util.UUID;

@Service
public class CurrentUserService {

    private static final String REQUEST_ATTRIBUTE = CurrentUserService.class.getName() + ".CURRENT";

    private final JdbcTemplate jdbc;

    public CurrentUserService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** User + space + role in one query, cached for the rest of the request. */
    public CurrentUser require(Authentication authentication) {
        RequestAttributes request = RequestContextHolder.getRequestAttributes();
        if (request != null && request.getAttribute(REQUEST_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST) instanceof CurrentUser cached
                && cached.email().equalsIgnoreCase(authentication.getName())) {
            return cached;
        }
        List<CurrentUser> found = jdbc.query(
                "SELECT u.id, u.email, u.display_name, u.is_admin, m.space_id, s.name AS space_name, m.role "
                        + "FROM app_user u LEFT JOIN space_member m ON m.user_id = u.id LEFT JOIN space s ON s.id = m.space_id "
                        + "WHERE lower(u.email) = lower(?)",
                (rs, i) -> new CurrentUser(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("display_name"),
                        rs.getBoolean("is_admin"), rs.getObject("space_id", UUID.class), rs.getString("space_name"),
                        rs.getString("role")),
                authentication.getName());
        if (found.isEmpty()) throw ApiException.unauthorized("Oturum bulunamadı");
        CurrentUser user = found.get(0);
        if (request != null) request.setAttribute(REQUEST_ATTRIBUTE, user, RequestAttributes.SCOPE_REQUEST);
        return user;
    }
}
