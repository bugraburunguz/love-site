package com.lovesite.export.render;

import java.util.Locale;

/**
 * The CSS photo filter of a theme (`sepia() saturate() contrast() brightness()`, applied left to right) as ffmpeg filters, so a
 * video under a polaroid gets exactly the look the site gives it with CSS. All four are linear in sRGB except the contrast
 * offset: out = b * c * (Saturate x Sepia) * in + b * 0.5 * (1 - c). The matrix goes to colorchannelmixer, the (tiny) offset
 * to eq's brightness.
 */
public final class ColorMatrix {

    private ColorMatrix() {
    }

    static double[][] sepia(double a) {
        double k = 1 - Math.min(1, Math.max(0, a));
        return new double[][] {
                {0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k},
                {0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k},
                {0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k},
        };
    }

    static double[][] saturate(double s) {
        return new double[][] {
                {0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s},
                {0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s},
                {0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s},
        };
    }

    static double[][] multiply(double[][] a, double[][] b) {
        double[][] r = new double[3][3];
        for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) for (int k = 0; k < 3; k++) r[i][j] += a[i][k] * b[k][j];
        return r;
    }

    /** The full linear part (what colorchannelmixer gets). */
    static double[][] matrix(double sepia, double saturate, double contrast, double brightness) {
        double[][] m = multiply(saturate(saturate), sepia(sepia));
        for (double[] row : m) for (int j = 0; j < 3; j++) row[j] *= brightness * contrast;
        return m;
    }

    /** ffmpeg filter chain for the given CSS filter values; empty when the filter is the identity. */
    public static String filter(double sepia, double saturate, double contrast, double brightness) {
        if (sepia == 0 && saturate == 1 && contrast == 1 && brightness == 1) return "";
        double[][] m = matrix(sepia, saturate, contrast, brightness);
        double offset = brightness * 0.5 * (1 - contrast);
        String mixer = String.format(Locale.ROOT, "colorchannelmixer=rr=%.5f:rg=%.5f:rb=%.5f:gr=%.5f:gg=%.5f:gb=%.5f:br=%.5f:bg=%.5f:bb=%.5f",
                m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]);
        String chain = "format=rgb24," + mixer;
        if (Math.abs(offset) > 0.0005) chain += String.format(Locale.ROOT, ",eq=brightness=%.5f", offset);
        return chain;
    }
}
