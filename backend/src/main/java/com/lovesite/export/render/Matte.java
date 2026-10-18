package com.lovesite.export.render;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Difference matting. A screenshot cannot cut a hole through the backgrounds of a video window's ancestors (frame paper,
 * page), so the render paints the windows in a key colour and shoots twice: A with magenta, B with green. For every pixel
 * A = F + (1 - a) * K1 and B = F + (1 - a) * K2 (F premultiplied), hence (1 - a) = (A - B) . (K1 - K2) / |K1 - K2|^2 and
 * F = A - (1 - a) * K1. The result is the scene with a real alpha channel: fully transparent where only the window shows,
 * partly transparent at anti-aliased edges and under whatever lies on top of the picture (corner ornaments stay solid).
 * Pixels the screenshot already left transparent (outside a sticker) are taken as they are.
 */
public final class Matte {

    static final int[] K1 = {255, 0, 255};
    static final int[] K2 = {0, 255, 0};

    private Matte() {
    }

    public static void apply(Path keyedA, Path keyedB, Path out) throws IOException {
        BufferedImage a = ImageIO.read(keyedA.toFile());
        BufferedImage b = ImageIO.read(keyedB.toFile());
        if (a == null || b == null || a.getWidth() != b.getWidth() || a.getHeight() != b.getHeight()) {
            throw new IOException("matte: the two screenshots do not match");
        }
        Files.write(out, new byte[0]);
        ImageIO.write(combine(a, b), "png", out.toFile());
    }

    static BufferedImage combine(BufferedImage a, BufferedImage b) {
        int w = a.getWidth();
        int h = a.getHeight();
        BufferedImage result = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        double dk0 = K1[0] - K2[0];
        double dk1 = K1[1] - K2[1];
        double dk2 = K1[2] - K2[2];
        double norm = dk0 * dk0 + dk1 * dk1 + dk2 * dk2;
        int[] rowA = new int[w];
        int[] rowB = new int[w];
        int[] rowOut = new int[w];
        for (int y = 0; y < h; y++) {
            a.getRGB(0, y, w, 1, rowA, 0, w);
            b.getRGB(0, y, w, 1, rowB, 0, w);
            for (int x = 0; x < w; x++) {
                int pa = rowA[x];
                int pb = rowB[x];
                int alphaA = pa >>> 24;
                if (alphaA < 255 || pa == pb) { // transparent outside, or untouched by the key: as it is
                    rowOut[x] = pa;
                    continue;
                }
                int ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
                int br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
                double t = ((ar - br) * dk0 + (ag - bg) * dk1 + (ab - bb) * dk2) / norm; // = 1 - alpha
                t = Math.max(0, Math.min(1, t));
                double alpha = 1 - t;
                if (alpha < 1.0 / 255) {
                    rowOut[x] = 0;
                    continue;
                }
                int r = channel((ar - t * K1[0]) / alpha);
                int g = channel((ag - t * K1[1]) / alpha);
                int bl = channel((ab - t * K1[2]) / alpha);
                rowOut[x] = ((int) Math.round(alpha * 255) << 24) | (r << 16) | (g << 8) | bl;
            }
            result.setRGB(0, y, w, 1, rowOut, 0, w);
        }
        return result;
    }

    private static int channel(double v) {
        return (int) Math.max(0, Math.min(255, Math.round(v)));
    }
}
