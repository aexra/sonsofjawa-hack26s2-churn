package team.jawa.churn.ingest;

import java.util.Set;
import java.util.regex.Pattern;

record FieldSpec(
        String name,
        Kind kind,
        boolean required,
        boolean nullable,
        boolean modelNowDefault,
        Long min,
        Long max,
        Integer maxLength,
        Pattern pattern,
        Set<String> values) {

    enum Kind {
        INT64,
        INT32,
        TEXT,
        BOOLEAN,
        TIMESTAMP,
        ENUM
    }

    static FieldSpec id() {
        return new FieldSpec("id", Kind.INT64, false, false, false, 1L, null, null, null, null);
    }

    static FieldSpec int64(String name, boolean required, long min) {
        return new FieldSpec(name, Kind.INT64, required, false, false, min, null, null, null, null);
    }

    static FieldSpec int32(String name, boolean required, long min, long max) {
        return new FieldSpec(name, Kind.INT32, required, false, false, min, max, null, null, null);
    }

    static FieldSpec text(String name, Integer maxLength, Pattern pattern) {
        return new FieldSpec(name, Kind.TEXT, true, false, false, null, null, maxLength, pattern, null);
    }

    static FieldSpec bool(String name) {
        return new FieldSpec(name, Kind.BOOLEAN, false, false, false, null, null, null, null, null);
    }

    static FieldSpec timestamp(String name, boolean required, boolean nullable, boolean modelNowDefault) {
        return new FieldSpec(name, Kind.TIMESTAMP, required, nullable, modelNowDefault, null, null, null, null, null);
    }

    static FieldSpec choice(String name, boolean required, String... values) {
        return new FieldSpec(name, Kind.ENUM, required, false, false, null, null, null, null, Set.of(values));
    }
}
