package com.lovesite.system;

import org.springframework.http.HttpStatus;

/** A domain error with a user-facing (Turkish) message; rendered as a ProblemDetail by ApiExceptionHandler. */
public class ApiException extends RuntimeException {

    public static final String QUOTA_EXCEEDED = "QUOTA_EXCEEDED";

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String detail) {
        this(status, detail, null);
    }

    public ApiException(HttpStatus status, String detail, String code) {
        super(detail);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    /** Machine-readable reason the frontend can branch on (rendered as the ProblemDetail property "code"). */
    public String code() {
        return code;
    }

    public static ApiException quotaExceeded() {
        return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Depolama alanınız dolu. Yer açmak için bir şeyler silin ya da yöneticiyle iletişime geçin.",
                QUOTA_EXCEEDED);
    }

    public static ApiException badRequest(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, detail);
    }

    public static ApiException unauthorized(String detail) {
        return new ApiException(HttpStatus.UNAUTHORIZED, detail);
    }

    public static ApiException forbidden(String detail) {
        return new ApiException(HttpStatus.FORBIDDEN, detail);
    }

    public static ApiException notFound(String detail) {
        return new ApiException(HttpStatus.NOT_FOUND, detail);
    }

    public static ApiException conflict(String detail) {
        return new ApiException(HttpStatus.CONFLICT, detail);
    }

    public static ApiException unprocessable(String detail) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, detail);
    }

    public static ApiException tooManyRequests(String detail) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, detail);
    }
}
