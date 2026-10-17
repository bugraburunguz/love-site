package com.lovesite.system;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

import static org.assertj.core.api.Assertions.assertThat;

class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void unexpectedErrorsExposeOnlyAGenericMessageAndCorrelationId() {
        ProblemDetail problem = handler.handleUnexpected(new IllegalStateException("password=hunter2 at db-host-1"));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR.value());
        String correlationId = (String) problem.getProperties().get("correlationId");
        assertThat(correlationId).hasSize(8);
        assertThat(problem.getDetail()).contains(correlationId).doesNotContain("hunter2").doesNotContain("db-host-1");
    }

    @Test
    void domainErrorsKeepTheirStatusAndMessage() {
        ProblemDetail problem = handler.handleApi(ApiException.unprocessable("Dosya çok büyük"));

        assertThat(problem.getStatus()).isEqualTo(422);
        assertThat(problem.getDetail()).isEqualTo("Dosya çok büyük");
    }
}
