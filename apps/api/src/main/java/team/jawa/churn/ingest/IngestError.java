package team.jawa.churn.ingest;

import java.util.LinkedHashMap;
import java.util.Map;

public record IngestError(Integer row, String entity, String field, String code, String message) {

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        if (row != null) {
            map.put("row", row);
        }
        if (entity != null) {
            map.put("entity", entity);
        }
        if (field != null) {
            map.put("field", field);
        }
        map.put("code", code);
        map.put("message", message);
        return map;
    }
}
