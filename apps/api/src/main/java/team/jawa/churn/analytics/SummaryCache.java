package team.jawa.churn.analytics;

import org.springframework.stereotype.Component;

@Component
public class SummaryCache {

    private record Entry(AnalyticsRepository.Fingerprint fingerprint, Summary summary) {}

    private final AnalyticsRepository repository;
    private volatile Entry entry;

    SummaryCache(AnalyticsRepository repository) {
        this.repository = repository;
    }

    public Summary get() {
        AnalyticsRepository.Fingerprint current = repository.fingerprint();
        Entry cached = entry;
        if (cached != null && cached.fingerprint().equals(current)) {
            return cached.summary();
        }
        synchronized (this) {
            cached = entry;
            if (cached == null || !cached.fingerprint().equals(current)) {
                cached = new Entry(current, repository.summary());
                entry = cached;
            }
            return cached.summary();
        }
    }
}
