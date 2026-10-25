package team.jawa.churn.web;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import team.jawa.churn.api.generated.api.CustomerDetailsApi;
import team.jawa.churn.api.generated.model.CustomerDetails;
import team.jawa.churn.api.generated.model.ScoreHistoryPoint;
import team.jawa.churn.customers.CustomerDetailsService;

@RestController
class CustomerDetailsController implements CustomerDetailsApi {

    private final CustomerDetailsService customers;

    CustomerDetailsController(CustomerDetailsService customers) {
        this.customers = customers;
    }

    @Override
    public ResponseEntity<CustomerDetails> getCustomer(Long id) {
        return ResponseEntity.ok(customers.get(id));
    }

    @Override
    public ResponseEntity<List<ScoreHistoryPoint>> getCustomerHistory(
            Long id, OffsetDateTime from, OffsetDateTime to, Integer limit) {
        return ResponseEntity.ok(customers.history(id, from, to, limit));
    }
}
