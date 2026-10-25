package team.jawa.churn.assistant;

final class AssistantFailure extends RuntimeException {

    private final Outcome outcome;

    AssistantFailure(Outcome outcome) {
        super(outcome.tag(), null, false, false);
        this.outcome = outcome;
    }

    Outcome outcome() {
        return outcome;
    }
}
