package team.jawa.churn;

import static org.assertj.core.api.Assertions.assertThat;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.parser.OpenAPIV3Parser;
import io.swagger.v3.parser.core.models.ParseOptions;
import io.swagger.v3.parser.core.models.SwaggerParseResult;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

class OpenApiContractTest {

    private static final List<String> REQUIRED_PATHS = List.of(
            "/api/v1/auth/login",
            "/api/v1/auth/me",
            "/api/v1/auth/logout",
            "/api/v1/customers",
            "/api/v1/customers/{id}",
            "/api/v1/analytics/summary",
            "/api/v1/model/settings",
            "/api/v1/source/snapshot",
            "/metrics");

    private static OpenAPI load() throws IOException {
        try (InputStream in = OpenApiContractTest.class.getResourceAsStream("/static/api/v1/openapi.yaml")) {
            assertThat(in).isNotNull();
            ParseOptions options = new ParseOptions();
            options.setResolve(true);
            SwaggerParseResult result = new OpenAPIV3Parser()
                    .readContents(new String(in.readAllBytes(), StandardCharsets.UTF_8), null, options);
            assertThat(result.getMessages()).isEmpty();
            return result.getOpenAPI();
        }
    }

    @Test
    void specificationDeclaresRequiredPaths() throws IOException {
        OpenAPI api = load();

        assertThat(api.getPaths().keySet()).containsAll(REQUIRED_PATHS);
    }

    @Test
    void everyOperationHasAnId() throws IOException {
        OpenAPI api = load();

        api.getPaths()
                .forEach((path, item) -> item.readOperations()
                        .forEach(operation ->
                                assertThat(operation.getOperationId()).as(path).isNotBlank()));
    }
}
