package com.lovesite.space;

import com.lovesite.user.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The caller's own space: name, members, usage and the partner invitation. There is no space id in any URL. */
@RestController
@RequestMapping("/api/space")
public class SpaceController {

    private final SpaceService spaces;
    private final InvitationService invitations;

    public SpaceController(SpaceService spaces, InvitationService invitations) {
        this.spaces = spaces;
        this.invitations = invitations;
    }

    @GetMapping
    public SpaceService.SpaceInfo info(CurrentUser me) {
        return spaces.info(me);
    }

    /** Owner only. Replaces the previous unused invitation of the space. */
    @PostMapping("/invites")
    @ResponseStatus(HttpStatus.CREATED)
    public InvitationService.Created invite(CurrentUser me) {
        return invitations.inviteMember(me);
    }
}
