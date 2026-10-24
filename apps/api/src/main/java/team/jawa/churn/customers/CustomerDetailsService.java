package team.jawa.churn.customers;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import team.jawa.churn.api.generated.model.Account;
import team.jawa.churn.api.generated.model.Anomaly;
import team.jawa.churn.api.generated.model.CustomerDetails;
import team.jawa.churn.api.generated.model.CustomerDetailsTransactions;
import team.jawa.churn.api.generated.model.CustomerScore;
import team.jawa.churn.api.generated.model.FeatureValue;
import team.jawa.churn.api.generated.model.NoScoreReason;
import team.jawa.churn.api.generated.model.PaymentTerm;
import team.jawa.churn.api.generated.model.Reason;
import team.jawa.churn.api.generated.model.RiskLevel;
import team.jawa.churn.api.generated.model.ScoreHistoryPoint;
import team.jawa.churn.api.generated.model.ScoreStatus;
import team.jawa.churn.api.generated.model.ServiceStatus;
import team.jawa.churn.api.generated.model.ServiceView;
import team.jawa.churn.api.generated.model.Transaction;
import team.jawa.churn.api.generated.model.TransactionStatus;
import team.jawa.churn.api.generated.model.TransactionType;
import team.jawa.churn.web.ApiException;

@Service
public class CustomerDetailsService {

    private static final int DEFAULT_HISTORY_LIMIT = 1000;

    private final CustomerDetailsRepository customers;
    private final ReasonRenderer reasons;

    CustomerDetailsService(CustomerDetailsRepository customers, ReasonRenderer reasons) {
        this.customers = customers;
        this.reasons = reasons;
    }

    @Transactional(readOnly = true)
    public CustomerDetails get(long id) {
        CustomerDetailsRepository.CustomerRow row = customers.find(id).orElseThrow(CustomerDetailsService::missing);
        return new CustomerDetails(account(row), score(row), services(id), transactions(id));
    }

    @Transactional(readOnly = true)
    public List<ScoreHistoryPoint> history(long id, OffsetDateTime from, OffsetDateTime to, Integer limit) {
        if (!customers.accountExists(id)) {
            throw missing();
        }
        int size = limit == null ? DEFAULT_HISTORY_LIMIT : limit;
        return customers.history(id, from, to, size).stream()
                .map(CustomerDetailsService::point)
                .toList();
    }

    private CustomerScore score(CustomerDetailsRepository.CustomerRow row) {
        List<Map<String, Object>> rendered =
                row.reasonsJson() == null ? List.of() : reasons.render(row.reasonsJson(), reasons.catalog());
        CustomerScore score = new CustomerScore(
                ScoreStatus.fromValue(row.status()),
                rendered.stream().map(CustomerDetailsService::reason).toList(),
                customers.features(row.id()).stream()
                        .map(CustomerDetailsService::feature)
                        .toList(),
                row.anomalies().stream().map(Anomaly::fromValue).toList());
        if (row.noScoreReason() != null) {
            score.noScoreReason(NoScoreReason.fromValue(row.noScoreReason()));
        }
        if (!"pending".equals(row.status())) {
            score.horizonDays(row.horizonDays())
                    .servicesTotal(row.servicesTotal())
                    .servicesLive(row.servicesLive())
                    .servicesAtRisk(row.servicesAtRisk())
                    .nextExpiryAt(row.nextExpiryAt())
                    .calculatedAt(row.calculatedAt())
                    .asOf(row.asOf())
                    .validUntil(row.validUntil())
                    .modelVersion(row.modelVersion());
        }
        if (row.riskScore() != null) {
            score.riskScore(plain(row.riskScore()))
                    .riskLevel(RiskLevel.fromValue(row.riskLevel()))
                    .loyalty(plain(BigDecimal.valueOf(100).subtract(row.riskScore())))
                    .probability(plain(row.riskScore().movePointLeft(2)));
        }
        if (row.revenueHorizon() != null && row.securedAmount() != null) {
            score.revenueHorizon(row.revenueHorizon())
                    .securedAmount(row.securedAmount())
                    .uncoveredAmount(Math.max(0L, row.revenueHorizon() - row.securedAmount()))
                    .expectedLoss(row.expectedLoss());
        }
        return score;
    }

    private List<ServiceView> services(long id) {
        return customers.services(id).stream()
                .map(CustomerDetailsService::service)
                .toList();
    }

    private CustomerDetailsTransactions transactions(long id) {
        CustomerDetailsRepository.Transactions transactions = customers.transactions(id);
        List<Transaction> items = transactions.items().stream()
                .map(CustomerDetailsService::transaction)
                .toList();
        return new CustomerDetailsTransactions(items, transactions.total(), transactions.notPerformed());
    }

    private static Account account(CustomerDetailsRepository.CustomerRow row) {
        return new Account(
                row.id(),
                row.email(),
                row.balance(),
                row.withdrawBalance(),
                row.totalReplenished(),
                row.bonusBalance(),
                Account.BonusStateEnum.fromValue(row.bonusState()));
    }

    private static ServiceView service(CustomerDetailsRepository.ServiceRow row) {
        return new ServiceView(
                        row.id(),
                        row.name(),
                        row.ownerId(),
                        PaymentTerm.fromValue(row.paymentTerm()),
                        row.autoProlong(),
                        row.createdAt(),
                        row.expiresAt(),
                        ServiceStatus.fromValue(row.status()),
                        row.price(),
                        row.live(),
                        row.atRisk())
                .daysLeft(plain(row.daysLeft()))
                .revenueHorizon(row.revenueHorizon());
    }

    private static Transaction transaction(CustomerDetailsRepository.TransactionRow row) {
        return new Transaction(
                        row.id(),
                        row.amount(),
                        TransactionStatus.fromValue(row.status()),
                        row.createdAt(),
                        TransactionType.fromValue(row.type()),
                        row.serviceId())
                .performedAt(row.performedAt());
    }

    private static Reason reason(Map<String, Object> raw) {
        return new Reason(
                String.valueOf(raw.get("key")),
                String.valueOf(raw.get("title")),
                String.valueOf(raw.get("text")),
                decimal(raw.get("value")),
                decimal(raw.get("weight")),
                decimal(raw.get("contribution")),
                params(raw));
    }

    private static FeatureValue feature(CustomerDetailsRepository.FeatureRow row) {
        return new FeatureValue(
                row.key(), row.title(), plain(row.value()), plain(row.weight()), plain(row.contribution()));
    }

    private static ScoreHistoryPoint point(CustomerDetailsRepository.HistoryRow row) {
        ScoreHistoryPoint point = new ScoreHistoryPoint(
                row.calculatedAt(),
                row.asOf(),
                ScoreHistoryPoint.StatusEnum.fromValue(row.status()),
                row.modelVersion());
        if (row.riskScore() != null) {
            point.riskScore(plain(row.riskScore())).riskLevel(RiskLevel.fromValue(row.riskLevel()));
        }
        return point.expectedLoss(row.expectedLoss());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> params(Map<String, Object> reason) {
        Object value = reason.get("params");
        if (value instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        return Map.of();
    }

    private static BigDecimal decimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal decimal) {
            return plain(decimal);
        }
        if (value instanceof Number number) {
            return plain(new BigDecimal(number.toString()));
        }
        return plain(new BigDecimal(value.toString()));
    }

    private static BigDecimal plain(BigDecimal value) {
        if (value == null) {
            return null;
        }
        BigDecimal stripped = value.stripTrailingZeros();
        return stripped.scale() < 0 ? stripped.setScale(0) : stripped;
    }

    private static ApiException missing() {
        return new ApiException(HttpStatus.NOT_FOUND, "not_found", "customer not found");
    }
}
