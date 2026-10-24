package team.jawa.churn.web;

import com.fasterxml.jackson.annotation.JsonValue;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import team.jawa.churn.api.generated.api.CustomersApi;
import team.jawa.churn.api.generated.model.CustomerField;
import team.jawa.churn.api.generated.model.CustomerPage;
import team.jawa.churn.api.generated.model.CustomerRow;
import team.jawa.churn.api.generated.model.RiskLevel;
import team.jawa.churn.api.generated.model.ScoreStatus;
import team.jawa.churn.customers.CustomerCsv;
import team.jawa.churn.customers.CustomerQuery;
import team.jawa.churn.customers.CustomerRepository;

@RestController
class CustomersController implements CustomersApi {

    private static final int EXPORT_LIMIT = 100_000;

    private static final class OrderedRow extends CustomerRow {

        private final Map<String, Object> values;

        OrderedRow(Map<String, Object> values) {
            this.values = values;
        }

        @JsonValue
        Map<String, Object> values() {
            return values;
        }
    }

    private final CustomerRepository customers;

    CustomersController(CustomerRepository customers) {
        this.customers = customers;
    }

    @Override
    public ResponseEntity<CustomerPage> listCustomers(
            Integer page,
            Integer size,
            List<String> sort,
            List<CustomerField> fields,
            List<RiskLevel> level,
            List<ScoreStatus> status,
            String q,
            BigDecimal minScore,
            BigDecimal maxScore,
            Long minLoss,
            Boolean hasAnomalies) {
        CustomerQuery query = query(sort, fields, level, status, q, minScore, maxScore, minLoss, hasAnomalies);
        CustomerRepository.Rows rows = customers.page(query, page, size);
        List<CustomerRow> items =
                rows.items().stream().<CustomerRow>map(OrderedRow::new).toList();
        int totalPages = (int) Math.ceil(rows.total() / (double) size);
        CustomerPage body = new CustomerPage(
                page,
                size,
                rows.total(),
                totalPages,
                items,
                query.columns().stream()
                        .map(column -> CustomerField.fromValue(column.apiName()))
                        .toList(),
                query.sorts().stream().map(CustomerQuery.Sort::label).toList());
        return ResponseEntity.ok(body);
    }

    @Override
    public ResponseEntity<String> exportCustomers(
            List<String> sort,
            List<CustomerField> fields,
            List<RiskLevel> level,
            List<ScoreStatus> status,
            String q,
            BigDecimal minScore,
            BigDecimal maxScore,
            Long minLoss,
            Boolean hasAnomalies) {
        CustomerQuery query = query(sort, fields, level, status, q, minScore, maxScore, minLoss, hasAnomalies);
        String csv = CustomerCsv.write(query.columns(), customers.all(query, EXPORT_LIMIT));
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment()
                                .filename("customers.csv")
                                .build()
                                .toString())
                .body(csv);
    }

    private static CustomerQuery query(
            List<String> sort,
            List<CustomerField> fields,
            List<RiskLevel> level,
            List<ScoreStatus> status,
            String q,
            BigDecimal minScore,
            BigDecimal maxScore,
            Long minLoss,
            Boolean hasAnomalies) {
        return CustomerQuery.of(
                sort,
                fields == null
                        ? null
                        : fields.stream().map(CustomerField::getValue).toList(),
                level == null ? null : level.stream().map(RiskLevel::getValue).toList(),
                status == null
                        ? null
                        : status.stream().map(ScoreStatus::getValue).toList(),
                q,
                minScore,
                maxScore,
                minLoss,
                hasAnomalies);
    }
}
