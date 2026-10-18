package com.lovesite.export;

import java.nio.file.Path;
import java.util.List;

/** Turns a claimed export into files. The real one drives Chromium + ffmpeg (render.ChromiumExportRenderer). */
public interface ExportRenderer {

    /** role: what the file is for the UI ("main", "zip", "png" ...) */
    record OutputFile(Path path, String name, String contentType, String role) {
    }

    /** notes: things the user should know about the result (Turkish, shown as they are) */
    /** meta: what the render measured per scene (polaroid position / rotation, caption overflow); kept with the job */
    record Result(List<OutputFile> files, List<String> notes, List<java.util.Map<String, Object>> meta) {
        public Result(List<OutputFile> files, List<String> notes) {
            this(files, notes, List.of());
        }

        public Result withMeta(List<java.util.Map<String, Object>> meta) {
            return new Result(files, notes, meta);
        }
    }

    Result render(ExportService.ExportRow job, Path workDir) throws Exception;
}
