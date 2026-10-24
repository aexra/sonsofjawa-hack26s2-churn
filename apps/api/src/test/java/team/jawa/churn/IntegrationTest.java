package team.jawa.churn;

import java.io.IOException;
import java.net.CookieManager;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "auth.jwt-secret=test-secret-test-secret-test-secret-1234",
            "auth.bootstrap-admin-password=admin12345",
            "auth.bootstrap-user-password=analyst12345"
        })
public abstract class IntegrationTest {

    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    static {
        POSTGRES.start();
    }

    @LocalServerPort
    protected int port;

    protected Client client() {
        return new Client(port);
    }

    public static final class Client {

        private final int port;
        private final CookieManager cookies = new CookieManager();
        private final HttpClient http;

        Client(int port) {
            this.port = port;
            this.http = HttpClient.newBuilder()
                    .cookieHandler(cookies)
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .build();
        }

        public HttpResponse<String> get(String path) throws IOException, InterruptedException {
            return send(request(path).GET().build());
        }

        public HttpResponse<String> post(String path, String json, boolean withCsrf)
                throws IOException, InterruptedException {
            HttpRequest.Builder builder = request(path).header("Content-Type", "application/json");
            if (withCsrf) {
                cookie("XSRF-TOKEN").ifPresent(token -> builder.header("X-XSRF-TOKEN", token));
            }
            return send(builder.POST(HttpRequest.BodyPublishers.ofString(json)).build());
        }

        public java.util.Optional<String> cookie(String name) {
            return cookies.getCookieStore().getCookies().stream()
                    .filter(c -> c.getName().equals(name))
                    .map(HttpCookie::getValue)
                    .findFirst();
        }

        public void setCookie(String name, String value, String path) {
            HttpCookie cookie = new HttpCookie(name, value);
            cookie.setPath(path);
            cookies.getCookieStore().add(URI.create("http://localhost:" + port), cookie);
        }

        private HttpRequest.Builder request(String path) {
            return HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        }

        private HttpResponse<String> send(HttpRequest request) throws IOException, InterruptedException {
            return http.send(request, HttpResponse.BodyHandlers.ofString());
        }
    }
}
