package com.lovesite.user;

import com.lovesite.system.ApiException;

import java.util.UUID;

/**
 * The signed-in user as the rest of the app needs to know them: who they are, which space they belong to and with
 * which role. Resolved once per request by CurrentUserService; every space-scoped query takes its spaceId from here
 * and never from the request.
 */
public record CurrentUser(UUID userId, String email, String displayName, boolean admin,
                          UUID spaceId, String spaceName, String role) {

    /** The space every query must be scoped to. A user without a space (a bare admin account) has no content. */
    public UUID requireSpace() {
        if (spaceId == null) throw ApiException.forbidden("Bir alana üye değilsiniz");
        return spaceId;
    }

    public boolean isOwner() {
        return "OWNER".equals(role);
    }

    public void requireOwner() {
        requireSpace();
        if (!isOwner()) throw ApiException.forbidden("Bu işlem için alan sahibi olmalısınız");
    }

    public void requireAdmin() {
        if (!admin) throw ApiException.forbidden("Bu işlem için yönetici olmalısınız");
    }
}
