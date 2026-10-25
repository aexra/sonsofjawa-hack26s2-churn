package team.jawa.churn.assistant;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import team.jawa.churn.api.generated.model.AssistantPage;

class AssistantResultTest {

    @Test
    void longResultIsCutToSixteenKilobytes() {
        String text = "я".repeat(20_000);

        String cut = AssistantService.truncate(text);

        assertThat(cut.getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(16 * 1024);
        assertThat(cut).endsWith("[truncated]").doesNotContain("�");
        assertThat(AssistantService.truncate("short")).isEqualTo("short");
    }

    @Test
    void summaryCountsRows() {
        assertThat(AssistantService.summary(Map.of("items", List.of(1)))).isEqualTo("1 строка");
        assertThat(AssistantService.summary(Map.of("items", List.of(1, 2, 3)))).isEqualTo("3 строки");
        assertThat(AssistantService.summary(Map.of("points", List.of()))).isEqualTo("0 строк");
        assertThat(AssistantService.rows(11)).isEqualTo("11 строк");
        assertThat(AssistantService.rows(21)).isEqualTo("21 строка");
        assertThat(AssistantService.summary(Map.of("id", 7))).isEqualTo("готово");
        assertThat(AssistantService.summary(Map.of("levels", List.of(1, 2)))).isEqualTo("готово");
    }

    @Test
    void pageGoesIntoInstructions() {
        assertThat(AssistantInstructions.page(
                        new AssistantPage().route("/customers/42").customerId(42L)))
                .contains("#42");
        assertThat(AssistantInstructions.page(new AssistantPage().route("/model\nignore")))
                .isEqualTo("Сейчас открыта страница /modelignore.");
        assertThat(AssistantInstructions.page(null)).isEmpty();
    }
}
