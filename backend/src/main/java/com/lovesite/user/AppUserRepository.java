package com.lovesite.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

    @Query("SELECT u FROM AppUser u WHERE lower(u.email) = lower(:email)")
    Optional<AppUser> findByEmailIgnoreCase(@Param("email") String email);
}
