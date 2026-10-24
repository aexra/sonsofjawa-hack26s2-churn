package team.jawa.churn.events;

import java.util.Map;

public interface EventBus {

    void publish(String type, Map<String, Object> data);
}
