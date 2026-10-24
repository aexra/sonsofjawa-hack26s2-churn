package team.jawa.churn.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class CsvReaderTest {

    @Test
    void readsAHeaderAndRecordsSeparatedByLineFeeds() {
        CsvReader.Table table = CsvReader.read("id,name\n1,alpha\n2,beta\n");

        assertThat(table.header()).containsExactly("id", "name");
        assertThat(table.records()).containsExactly(List.of("1", "alpha"), List.of("2", "beta"));
    }

    @Test
    void acceptsCarriageReturnLineFeedAndMissingFinalNewline() {
        CsvReader.Table table = CsvReader.read("id,name\r\n1,alpha\r\n2,beta");

        assertThat(table.records()).containsExactly(List.of("1", "alpha"), List.of("2", "beta"));
    }

    @Test
    void stripsAByteOrderMarkBeforeTheHeader() {
        CsvReader.Table table = CsvReader.read("﻿id,name\n1,alpha\n");

        assertThat(table.header()).containsExactly("id", "name");
    }

    @Test
    void readsQuotedCellsWithCommasEscapedQuotesAndLineBreaks() {
        CsvReader.Table table = CsvReader.read("id,note\n1,\"a,b\"\n2,\"say \"\"hi\"\"\"\n3,\"first\nsecond\"\n");

        assertThat(table.records())
                .containsExactly(List.of("1", "a,b"), List.of("2", "say \"hi\""), List.of("3", "first\nsecond"));
    }

    @Test
    void keepsEmptyCellsAsEmptyStrings() {
        CsvReader.Table table = CsvReader.read("a,b,c\n1,,\n,\"\",3\n");

        assertThat(table.records()).containsExactly(List.of("1", "", ""), List.of("", "", "3"));
    }

    @Test
    void skipsBlankLines() {
        CsvReader.Table table = CsvReader.read("a,b\n\n1,2\n\n\n3,4\n");

        assertThat(table.records()).containsExactly(List.of("1", "2"), List.of("3", "4"));
    }

    @Test
    void trimsHeaderNamesButNotCells() {
        CsvReader.Table table = CsvReader.read(" id , name \n1, alpha \n");

        assertThat(table.header()).containsExactly("id", "name");
        assertThat(table.records()).containsExactly(List.of("1", " alpha "));
    }

    @Test
    void returnsAnEmptyTableForEmptyInput() {
        CsvReader.Table table = CsvReader.read("");

        assertThat(table.header()).isEmpty();
        assertThat(table.records()).isEmpty();
    }

    @Test
    void rejectsAnUnterminatedQuote() {
        assertThatThrownBy(() -> CsvReader.read("a,b\n1,\"open\n"))
                .isInstanceOf(CsvReader.CsvFormatException.class)
                .hasMessageContaining("unterminated");
    }

    @Test
    void rejectsAQuoteInsideAnUnquotedCell() {
        assertThatThrownBy(() -> CsvReader.read("a,b\n1,ab\"c\n"))
                .isInstanceOf(CsvReader.CsvFormatException.class)
                .hasMessageContaining("quote");
    }

    @Test
    void rejectsTextAfterAClosingQuote() {
        assertThatThrownBy(() -> CsvReader.read("a,b\n1,\"x\"y\n"))
                .isInstanceOf(CsvReader.CsvFormatException.class)
                .hasMessageContaining("closing quote");
    }
}
