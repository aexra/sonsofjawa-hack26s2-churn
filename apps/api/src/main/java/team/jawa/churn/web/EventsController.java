package team.jawa.churn.web;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import team.jawa.churn.events.EventSubscribers;

@RestController
@RequestMapping("/api/v1/events")
class EventsController {

    private final EventSubscribers subscribers;

    EventsController(EventSubscribers subscribers) {
        this.subscribers = subscribers;
    }

    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter stream() {
        return subscribers.subscribe();
    }
}
