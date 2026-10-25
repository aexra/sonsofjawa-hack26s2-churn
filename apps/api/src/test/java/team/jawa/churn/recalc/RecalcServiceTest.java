package team.jawa.churn.recalc;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import org.junit.jupiter.api.Test;

class RecalcServiceTest {

    @Test
    void aSerializationFailureIsRecognizedThroughWrappers() {
        RuntimeException failure =
                new RuntimeException("outer", new IllegalStateException(new SQLException("x", "40001")));

        assertThat(RecalcService.isSerializationFailure(failure)).isTrue();
    }

    @Test
    void otherFailuresAreNotSerializationFailures() {
        assertThat(RecalcService.isSerializationFailure(new RuntimeException(new SQLException("x", "22023"))))
                .isFalse();
        assertThat(RecalcService.isSerializationFailure(new RuntimeException("plain")))
                .isFalse();
    }
}
