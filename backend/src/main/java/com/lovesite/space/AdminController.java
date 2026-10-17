package com.lovesite.space;

import com.lovesite.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Platform administration. Shows names, numbers and quotas only: nothing here (or anywhere else) lets an admin read
 * the albums or media of a space they are not a member of.
 */
@RestController
@RequestMapping("/api/admin/spaces")
public class AdminController {

    public record CreateSpaceRequest(
            @NotBlank(message = "Alan adı gerekli") @Size(max = 200, message = "Alan adı çok uzun") String name,
            @NotNull(message = "Depolama limiti gerekli") @Positive(message = "Limit sıfırdan büyük olmalı") Double limitGb) {
    }

    public record UpdateSpaceRequest(
            @Size(max = 200, message = "Alan adı çok uzun") String name,
            @Positive(message = "Limit sıfırdan büyük olmalı") Double limitGb) {
    }

    public record CreatedSpace(SpaceService.AdminSpace space, InvitationService.Created invitation) {
    }

    private final SpaceService spaces;
    private final InvitationService invitations;

    public AdminController(SpaceService spaces, InvitationService invitations) {
        this.spaces = spaces;
        this.invitations = invitations;
    }

    @GetMapping
    public List<SpaceService.AdminSpace> list(CurrentUser me) {
        me.requireAdmin();
        return spaces.adminList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CreatedSpace create(CurrentUser me, @Valid @RequestBody CreateSpaceRequest request) {
        me.requireAdmin();
        InvitationService.Created invitation = invitations.createSpaceWithOwnerInvite(me, request.name(), request.limitGb());
        return new CreatedSpace(spaces.summary(spaces.get(invitation.spaceId())), invitation);
    }

    @PatchMapping("/{id}")
    public SpaceService.AdminSpace update(CurrentUser me, @PathVariable UUID id, @Valid @RequestBody UpdateSpaceRequest request) {
        me.requireAdmin();
        return spaces.update(id, request.name(), request.limitGb());
    }

    /** New owner link for a space nobody has joined yet. */
    @PostMapping("/{id}/invites")
    @ResponseStatus(HttpStatus.CREATED)
    public InvitationService.Created reissue(CurrentUser me, @PathVariable UUID id) {
        me.requireAdmin();
        return invitations.reissueOwnerInvite(me, id);
    }
}
