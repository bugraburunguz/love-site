package com.lovesite.auth;

import com.lovesite.user.CurrentUser;

import java.util.UUID;

public record UserResponse(UUID id, String email, String displayName, boolean admin, UUID spaceId, String spaceName,
                           String role) {

    public static UserResponse from(CurrentUser user) {
        return new UserResponse(user.userId(), user.email(), user.displayName(), user.admin(), user.spaceId(),
                user.spaceName(), user.role());
    }
}
