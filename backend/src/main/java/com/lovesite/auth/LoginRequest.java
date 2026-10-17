package com.lovesite.auth;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(@NotBlank(message = "E-posta gerekli") String email, @NotBlank(message = "Şifre gerekli") String password) {
}
