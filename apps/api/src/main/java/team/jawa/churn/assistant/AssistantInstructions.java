package team.jawa.churn.assistant;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import team.jawa.churn.api.generated.model.AssistantPage;

@Component
class AssistantInstructions {

    private static final String RESOURCE = "assistant/instructions.md";

    private final String template;
    private final JdbcClient jdbc;

    AssistantInstructions(JdbcClient jdbc) {
        this.jdbc = jdbc;
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            this.template = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    String render(AssistantPage page) {
        return template.replace("{{today}}", today())
                .replace("{{page}}", page(page))
                .strip();
    }

    private String today() {
        OffsetDateTime now = jdbc.sql("SELECT public.model_now()")
                .query(OffsetDateTime.class)
                .single();
        return now.withOffsetSameInstant(ZoneOffset.UTC).toLocalDate().toString();
    }

    static String page(AssistantPage page) {
        if (page == null) {
            return "";
        }
        if (page.getCustomerId() != null) {
            return "Сейчас открыта карточка клиента #" + page.getCustomerId()
                    + ". Вопросы про «этого клиента» относятся к нему.";
        }
        String route = page.getRoute() == null ? "" : page.getRoute().replaceAll("[^\\p{L}\\p{N}/._?=&%-]", "");
        return route.isEmpty() ? "" : "Сейчас открыта страница " + route + ".";
    }
}
