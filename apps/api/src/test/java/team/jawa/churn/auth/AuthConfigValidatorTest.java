package team.jawa.churn.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

class AuthConfigValidatorTest {

    @Configuration
    @EnableConfigurationProperties({AuthProperties.class, OidcProperties.class})
    @Import(AuthConfigValidator.class)
    static class Config {}

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(Config.class)
            .withPropertyValues(
                    "auth.local-enabled=true",
                    "auth.jwt-secret=",
                    "auth.access-ttl=15m",
                    "auth.refresh-ttl=30d",
                    "oidc.issuer-uri=");

    @Test
    void startsWithLocalLogin() {
        runner.run(context -> assertThat(context).hasNotFailed());
    }

    @Test
    void failsWithoutAnyLoginMethod() {
        runner.withPropertyValues("auth.local-enabled=false")
                .run(context -> assertThat(context)
                        .hasFailed()
                        .getFailure()
                        .rootCause()
                        .hasMessage("No login method configured: set AUTH_LOCAL_ENABLED=true or OIDC_ISSUER_URI"));
    }

    @Test
    void startsWithOidcOnly() {
        runner.withPropertyValues(
                        "auth.local-enabled=false",
                        "oidc.issuer-uri=https://idp.example/realms/r",
                        "oidc.client-id=churn",
                        "oidc.client-secret=secret")
                .run(context -> assertThat(context).hasNotFailed());
    }

    @Test
    void failsWhenOidcHasNoClientCredentials() {
        runner.withPropertyValues("oidc.issuer-uri=https://idp.example/realms/r")
                .run(context -> assertThat(context)
                        .hasFailed()
                        .getFailure()
                        .hasRootCauseMessage(
                                "OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are required with OIDC_ISSUER_URI"));
    }

    @Test
    void failsWithShortSecret() {
        runner.withPropertyValues("auth.jwt-secret=too-short")
                .run(context -> assertThat(context)
                        .hasFailed()
                        .getFailure()
                        .rootCause()
                        .hasMessage("AUTH_JWT_SECRET must be at least 32 bytes"));
    }
}
