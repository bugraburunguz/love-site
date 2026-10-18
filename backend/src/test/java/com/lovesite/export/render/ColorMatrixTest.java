package com.lovesite.export.render;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class ColorMatrixTest {

    @Test
    void identityNeedsNoFilter() {
        assertThat(ColorMatrix.filter(0, 1, 1, 1)).isEmpty();
    }

    @Test
    void matchesTheCssDefinitions() {
        // full sepia maps white to the known CSS value (0.393+0.769+0.189 = 1.351 -> clipped by the encoder)
        double[][] s = ColorMatrix.sepia(1);
        assertThat(s[0][0] + s[0][1] + s[0][2]).isCloseTo(1.351, within(1e-9));
        // saturate keeps greys grey (rows sum to 1)
        double[][] sat = ColorMatrix.saturate(0.8);
        for (double[] row : sat) assertThat(row[0] + row[1] + row[2]).isCloseTo(1, within(1e-9));
        // brightness and contrast scale the matrix
        double[][] m = ColorMatrix.matrix(0, 1, 1.1, 1.05);
        assertThat(m[0][0]).isCloseTo(1.155, within(1e-9));
        assertThat(ColorMatrix.filter(0.12, 0.95, 1.03, 1.02)).startsWith("format=rgb24,colorchannelmixer=").contains("eq=brightness=-0.0153");
    }
}
