package com.lovesite.export.render;

import org.junit.jupiter.api.Test;

import java.awt.image.BufferedImage;

import static org.assertj.core.api.Assertions.assertThat;

class MatteTest {

    static BufferedImage of(int... argb) {
        BufferedImage img = new BufferedImage(argb.length, 1, BufferedImage.TYPE_INT_ARGB);
        for (int i = 0; i < argb.length; i++) img.setRGB(i, 0, argb[i]);
        return img;
    }

    /** colour F with coverage alpha composited over key K */
    static int over(int r, int g, int b, double alpha, int[] k) {
        return 0xFF000000 | ((int) Math.round(r * alpha + k[0] * (1 - alpha)) << 16)
                | ((int) Math.round(g * alpha + k[1] * (1 - alpha)) << 8) | (int) Math.round(b * alpha + k[2] * (1 - alpha));
    }

    @Test
    void recoversOpaqueTransparentAndPartialPixels() {
        int frame = 0xFFF8F1E1;              // frame paper: same in both shots
        int windowA = 0xFFFF00FF;            // only the window shows
        int windowB = 0xFF00FF00;
        int edgeA = over(200, 150, 100, 0.4, Matte.K1); // anti-aliased edge of an ornament over the window
        int edgeB = over(200, 150, 100, 0.4, Matte.K2);
        int outside = 0x00000000;            // left transparent by the screenshot (sticker background)
        BufferedImage out = Matte.combine(of(frame, windowA, edgeA, outside), of(frame, windowB, edgeB, outside));
        assertThat(out.getRGB(0, 0)).isEqualTo(frame);
        assertThat(out.getRGB(1, 0) >>> 24).isZero();
        int edge = out.getRGB(2, 0);
        assertThat(edge >>> 24).isBetween(100, 104); // 0.4 * 255
        assertThat((edge >> 16) & 255).isBetween(197, 203);
        assertThat((edge >> 8) & 255).isBetween(147, 153);
        assertThat(edge & 255).isBetween(97, 103);
        assertThat(out.getRGB(3, 0) >>> 24).isZero();
    }
}
