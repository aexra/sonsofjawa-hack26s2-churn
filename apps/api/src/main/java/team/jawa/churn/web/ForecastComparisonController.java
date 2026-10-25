package team.jawa.churn.web;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import team.jawa.churn.analytics.ForecastComparison;

@RestController
public class ForecastComparisonController {
    private final ForecastComparison comparison;

    public ForecastComparisonController(ForecastComparison comparison) {
        this.comparison = comparison;
    }

    @GetMapping("/api/v1/analytics/model-comparison")
    public ForecastComparison.Result get(
            @RequestParam(defaultValue = "90") int pastDays,
            @RequestParam(required = false) Integer futureDays,
            @RequestParam(defaultValue = "false") boolean includeMl) {
        if (pastDays < 1 || pastDays > 365 || (futureDays != null && (futureDays < 1 || futureDays > 365))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_filter", "days must be between 1 and 365");
        }
        return comparison.calculate(pastDays, futureDays, includeMl);
    }
}
