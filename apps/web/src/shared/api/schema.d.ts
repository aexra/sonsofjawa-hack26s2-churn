export interface paths {
    "/api/v1/auth/providers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getAuthProviders"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getCurrentUser"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/oidc/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["oidcLogin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/oidc/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["oidcCallback"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/customers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listCustomers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/customers/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["exportCustomers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/customers/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getCustomer"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/customers/{id}/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getCustomerHistory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getAnalyticsSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/churn-chart": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getChurnChart"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/model-comparison": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getForecastComparison"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/model/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getModelSettings"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["updateModelSettings"];
        trace?: never;
    };
    "/api/v1/model/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listModelRevisions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/recalc": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["requestRecalc"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/recalc/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getRecalcStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/source/snapshot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["replaceSnapshot"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/source/accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listSourceAccounts"];
        put?: never;
        post: operations["upsertAccounts"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/source/services": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listSourceServices"];
        put?: never;
        post: operations["upsertServices"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/source/transactions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listSourceTransactions"];
        put?: never;
        post: operations["upsertTransactions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/source/ingest-log": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listIngestLog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["streamEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/assistant/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["askAssistant"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listUsers"];
        put?: never;
        post: operations["createUser"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/users/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["deleteUser"];
        options?: never;
        head?: never;
        patch: operations["updateUser"];
        trace?: never;
    };
    "/api/v1/admin/api-keys": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listApiKeys"];
        put?: never;
        post: operations["createApiKey"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/api-keys/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["revokeApiKey"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getMetrics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Problem: {
            type: string;
            title: string;
            status: number;
            code: "unauthenticated" | "forbidden" | "local_auth_disabled" | "invalid_credentials" | "account_disabled" | "refresh_invalid" | "csrf_invalid" | "not_found" | "invalid_field" | "invalid_sort" | "invalid_filter" | "validation_failed" | "payload_too_large" | "unsupported_media_type" | "conflict" | "last_admin" | "rate_limited" | "assistant_disabled" | "internal";
            detail?: string;
            requestId?: string;
            errors?: components["schemas"]["FieldError"][];
        };
        FieldError: {
            row?: number;
            entity?: "accounts" | "services" | "transactions";
            field?: string;
            code: string;
            message: string;
        };
        Role: "user" | "admin";
        AuthProvider: "local" | "oidc" | "api_key";
        ApiKeyScope: "read" | "ingest" | "metrics";
        AuthProviders: {
            local: {
                enabled: boolean;
            };
            oidc: {
                enabled: boolean;
                displayName?: string;
                loginUrl?: string;
            };
        };
        LoginRequest: {
            login: string;
            password: string;
        };
        CurrentUser: {
            id?: number;
            login: string;
            email?: string | null;
            displayName?: string | null;
            role?: components["schemas"]["Role"];
            authProvider: components["schemas"]["AuthProvider"];
            scopes?: components["schemas"]["ApiKeyScope"][];
            assistantEnabled?: boolean;
        };
        RiskLevel: "high" | "medium" | "low";
        ScoreStatus: "scored" | "no_score" | "pending";
        NoScoreReason: "no_services" | "no_live_services";
        CustomerField: "id" | "email" | "balance" | "withdrawBalance" | "totalReplenished" | "bonusBalance" | "bonusState" | "scoreStatus" | "noScoreReason" | "riskScore" | "riskLevel" | "loyalty" | "expectedLoss" | "revenueHorizon" | "securedAmount" | "servicesTotal" | "servicesLive" | "servicesAtRisk" | "nextExpiryAt" | "topReason" | "reasons" | "anomalies" | "calculatedAt" | "asOf" | "modelVersion";
        Reason: {
            key: string;
            title: string;
            text: string;
            value: number;
            weight: number;
            contribution: number;
            params: {
                [key: string]: unknown;
            };
        };
        CustomerRow: {
            id?: number;
            email?: string;
            balance?: number;
            withdrawBalance?: number;
            totalReplenished?: number;
            bonusBalance?: number;
            bonusState?: "locked" | "unlocked";
            scoreStatus?: components["schemas"]["ScoreStatus"];
            noScoreReason?: components["schemas"]["NoScoreReason"] | null;
            riskScore?: number | null;
            riskLevel?: components["schemas"]["RiskLevel"] | null;
            loyalty?: number | null;
            expectedLoss?: number | null;
            revenueHorizon?: number | null;
            securedAmount?: number | null;
            servicesTotal?: number | null;
            servicesLive?: number | null;
            servicesAtRisk?: number | null;
            nextExpiryAt?: string | null;
            topReason?: components["schemas"]["Reason"] | null;
            reasons?: components["schemas"]["Reason"][];
            anomalies?: components["schemas"]["Anomaly"][];
            calculatedAt?: string | null;
            asOf?: string | null;
            modelVersion?: number | null;
        };
        Anomaly: "expired_but_live" | "overdue_prolong_wait" | "withdraw_exceeds_balance" | "balance_exceeds_replenished";
        PageMeta: {
            page: number;
            size: number;
            totalItems: number;
            totalPages: number;
        };
        CustomerPage: components["schemas"]["PageMeta"] & {
            items: components["schemas"]["CustomerRow"][];
            fields: components["schemas"]["CustomerField"][];
            sort: string[];
        };
        Account: {
            id: number;
            email: string;
            balance: number;
            withdrawBalance: number;
            totalReplenished: number;
            bonusBalance: number;
            bonusState: "locked" | "unlocked";
        };
        PaymentTerm: "hour" | "week" | "month" | "quarter_year" | "half_year" | "year";
        ServiceStatus: "active" | "blocked" | "deleted" | "suspended" | "prolong_wait";
        Service: {
            id: number;
            name: string;
            ownerId: number;
            paymentTerm: components["schemas"]["PaymentTerm"];
            autoProlong: boolean;
            createdAt: string;
            expiresAt: string;
            status: components["schemas"]["ServiceStatus"];
            price: number;
        };
        TransactionStatus: "not_performed" | "performed";
        TransactionType: "prolong" | "order";
        Transaction: {
            id: number;
            amount: number;
            status: components["schemas"]["TransactionStatus"];
            performedAt?: string | null;
            createdAt: string;
            type: components["schemas"]["TransactionType"];
            serviceId: number;
        };
        AccountInput: {
            id?: number;
            email: string;
            balance: number;
            withdrawBalance: number;
            totalReplenished: number;
            bonusBalance: number;
            bonusState: "locked" | "unlocked";
        };
        ServiceInput: {
            id?: number;
            name: string;
            ownerId: number;
            paymentTerm: components["schemas"]["PaymentTerm"];
            autoProlong: boolean;
            createdAt?: string;
            expiresAt: string;
            status: components["schemas"]["ServiceStatus"];
            price: number;
        };
        TransactionInput: {
            id?: number;
            amount: number;
            status?: components["schemas"]["TransactionStatus"];
            performedAt?: string | null;
            createdAt?: string;
            type: components["schemas"]["TransactionType"];
            serviceId: number;
        };
        SnapshotInput: {
            accounts: components["schemas"]["AccountInput"][];
            services: components["schemas"]["ServiceInput"][];
            transactions: components["schemas"]["TransactionInput"][];
        };
        AccountPage: components["schemas"]["PageMeta"] & {
            items: components["schemas"]["Account"][];
        };
        ServicePage: components["schemas"]["PageMeta"] & {
            items: components["schemas"]["Service"][];
        };
        TransactionPage: components["schemas"]["PageMeta"] & {
            items: components["schemas"]["Transaction"][];
        };
        IngestResult: {
            logId?: number;
            mode: "upsert" | "snapshot";
            entity: "accounts" | "services" | "transactions" | "snapshot";
            format: "json" | "csv";
            rowsReceived: number;
            rowsApplied: number;
            applied?: {
                accounts?: number;
                services?: number;
                transactions?: number;
            };
            recalc: components["schemas"]["RecalcAccepted"];
        };
        IngestLogEntry: {
            id: number;
            receivedAt: string;
            actor: string;
            channel: "api" | "web";
            mode: "upsert" | "snapshot";
            entity: "accounts" | "services" | "transactions" | "snapshot";
            format: "json" | "csv";
            rowsReceived: number;
            rowsApplied: number;
            status: "ok" | "rejected";
            errors: components["schemas"]["FieldError"][];
        };
        IngestLogPage: components["schemas"]["PageMeta"] & {
            items: components["schemas"]["IngestLogEntry"][];
        };
        CustomerScore: {
            status: components["schemas"]["ScoreStatus"];
            noScoreReason?: components["schemas"]["NoScoreReason"] | null;
            riskScore?: number | null;
            riskLevel?: components["schemas"]["RiskLevel"] | null;
            loyalty?: number | null;
            probability?: number | null;
            revenueHorizon?: number | null;
            securedAmount?: number | null;
            uncoveredAmount?: number | null;
            expectedLoss?: number | null;
            horizonDays?: number;
            servicesTotal?: number;
            servicesLive?: number;
            servicesAtRisk?: number;
            nextExpiryAt?: string | null;
            calculatedAt?: string | null;
            asOf?: string | null;
            validUntil?: string | null;
            modelVersion?: number | null;
            reasons: components["schemas"]["Reason"][];
            features: components["schemas"]["FeatureValue"][];
            anomalies: components["schemas"]["Anomaly"][];
        };
        FeatureValue: {
            key: string;
            title: string;
            value: number;
            weight: number;
            contribution: number;
        };
        ServiceView: components["schemas"]["Service"] & {
            isLive: boolean;
            daysLeft?: number | null;
            revenueHorizon?: number;
            atRisk: boolean;
        };
        CustomerDetails: {
            account: components["schemas"]["Account"];
            score: components["schemas"]["CustomerScore"];
            services: components["schemas"]["ServiceView"][];
            transactions: {
                items: components["schemas"]["Transaction"][];
                total: number;
                notPerformed: number;
            };
        };
        ScoreHistoryPoint: {
            calculatedAt: string;
            asOf: string;
            status: "scored" | "no_score" | "removed";
            riskScore?: number | null;
            riskLevel?: components["schemas"]["RiskLevel"] | null;
            expectedLoss?: number | null;
            modelVersion: number;
        };
        AnalyticsSummary: {
            asOf: string;
            calculatedAt?: string | null;
            modelVersion: number;
            horizonDays: number;
            currency: "EUR";
            accounts: {
                total: number;
                scored: number;
                high: number;
                medium: number;
                low: number;
                noScore: number;
                pending: number;
            };
            money: {
                expectedLoss: number;
                revenueHorizon: number;
                revenueAtRisk: number;
                securedAmount: number;
            };
            avgRiskScore?: number | null;
            servicesAtRisk: number;
            scoreHistogram: {
                from: number;
                to: number;
                count: number;
            }[];
            topReasons: {
                key: string;
                title: string;
                customers: number;
                contributionSum: number;
            }[];
            lastRecalc?: components["schemas"]["RecalcRun"] | null;
        };
        ForecastComparison: {
            expert: components["schemas"]["ChurnChart"];
            ml: components["schemas"]["ChurnChart"] | null;
            mlState: "not_requested" | "unavailable" | "ready";
            modelId?: string | null;
            provenance?: "real" | "synthetic" | null;
            payments: number;
            amountBasis: "first_payment_face_value";
            training?: components["schemas"]["MlTrainingStatus"] | null;
        };
        MlTrainingStatus: {
            state: string;
            automaticRetraining: boolean;
            intervalSeconds: number;
            lastRunAt?: string | null;
            nextRunAt?: string | null;
            lastResult?: string | null;
            modelId?: string | null;
            provenance?: string | null;
            policyVersion?: string | null;
            availableFrom?: string | null;
            demonstrationEnabled?: boolean;
        };
        ChurnChart: {
            asOf: string;
            horizonDays: number;
            points: components["schemas"]["ChurnChartPoint"][];
        };
        ChurnChartPoint: {
            date: string;
            kind: "fact" | "today" | "forecast";
            deletions?: number | null;
            deletionsEstimated?: number | null;
            servicesAtRisk?: number | null;
            expectedNonRenewals?: number | null;
            expectedLossAmount?: number | null;
            overdueNonRenewals?: number | null;
            overdueLossAmount?: number | null;
        };
        ModelSetting: {
            key: string;
            value: number;
            defaultValue: number;
            min: number;
            max: number;
            unit: "points" | "days" | "hours" | "count";
            title: string;
            description: string;
            share?: number | null;
        };
        SettingsGroup: {
            key: "weights" | "levels" | "horizon" | "quality";
            settings: components["schemas"]["ModelSetting"][];
        };
        ModelFeature: {
            key: string;
            weightKey: string;
            title: string;
            description: string;
            reasonTemplate: string;
        };
        ClockMode: "real" | "frozen" | "shifted";
        ModelClock: {
            mode: components["schemas"]["ClockMode"];
            asOf: string;
            frozenAt?: string | null;
            shiftSeconds?: number;
            updatedAt?: string;
            updatedBy?: string;
        };
        ModelSettings: {
            modelVersion: number;
            updatedAt?: string;
            updatedBy?: string;
            clock: components["schemas"]["ModelClock"];
            groups: components["schemas"]["SettingsGroup"][];
            features: components["schemas"]["ModelFeature"][];
        };
        ModelSettingsPatch: {
            values?: {
                [key: string]: number;
            };
            clock?: {
                mode: components["schemas"]["ClockMode"];
                asOf?: string;
            };
        };
        ModelSettingsUpdated: components["schemas"]["ModelSettings"] & {
            recalc: components["schemas"]["RecalcAccepted"];
        };
        ModelRevision: {
            version: number;
            changedAt: string;
            changedBy: string;
            source: "migration" | "settings" | "clock";
            changes: {
                [key: string]: unknown;
            }[];
        };
        RecalcAccepted: {
            state: "scheduled" | "coalesced";
        };
        RecalcRun: {
            id: number;
            trigger: "timer" | "manual" | "model" | "snapshot" | "ingest";
            startedAt: string;
            finishedAt?: string | null;
            asOf?: string | null;
            modelVersion?: number | null;
            accountsProcessed: number;
            status: "running" | "ok" | "failed";
            error?: string | null;
        };
        RecalcStatus: {
            running: boolean;
            pendingAccounts: number;
            lastRun?: components["schemas"]["RecalcRun"] | null;
            recentRuns: components["schemas"]["RecalcRun"][];
        };
        LiveEvent: {
            type: "recalc.started" | "recalc.completed" | "recalc.failed" | "model.updated" | "ingest.completed";
            runId?: number;
            trigger?: string;
            accountsProcessed?: number;
            modelVersion?: number;
            asOf?: string;
            finishedAt?: string;
            error?: string;
            source?: string;
            entity?: string;
            mode?: string;
            rowsApplied?: number;
        };
        AssistantRequest: {
            messages: components["schemas"]["AssistantMessage"][];
            page?: components["schemas"]["AssistantPage"];
            mcpKey?: string;
        };
        AssistantMessage: {
            role: "user" | "assistant";
            content: string;
        };
        AssistantPage: {
            route?: string;
            customerId?: number;
        };
        AssistantEvent: {
            type: "step" | "text" | "done" | "error";
            id?: string;
            tool?: string;
            status?: "started" | "done" | "failed";
            summary?: string;
            delta?: string;
            steps?: number;
            code?: "assistant_unavailable" | "assistant_timeout" | "assistant_key_invalid" | "assistant_key_forbidden" | "assistant_step_limit";
        };
        User: {
            id: number;
            login: string;
            email?: string | null;
            displayName?: string | null;
            role: components["schemas"]["Role"];
            authProvider: "local" | "oidc";
            enabled: boolean;
            createdAt: string;
            lastLoginAt?: string | null;
        };
        UserCreate: {
            login: string;
            password: string;
            role: components["schemas"]["Role"];
            email?: string;
            displayName?: string;
        };
        UserPatch: {
            role?: components["schemas"]["Role"];
            enabled?: boolean;
            displayName?: string;
            email?: string;
            password?: string;
        };
        ApiKey: {
            id: number;
            name: string;
            prefix: string;
            scopes: components["schemas"]["ApiKeyScope"][];
            createdBy?: string | null;
            createdAt: string;
            expiresAt?: string | null;
            lastUsedAt?: string | null;
            revokedAt?: string | null;
        };
        ApiKeyCreate: {
            name: string;
            scopes: components["schemas"]["ApiKeyScope"][];
            expiresAt?: string;
        };
        ApiKeyCreated: {
            key: components["schemas"]["ApiKey"];
            secret: string;
        };
    };
    responses: {
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        PayloadTooLarge: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        UnsupportedMediaType: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        Unprocessable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        TooManyRequests: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        AssistantDisabled: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        IdPath: number;
        Page: number;
        Size: number;
        Ids: number[];
        CustomerSort: string[];
        CustomerFields: components["schemas"]["CustomerField"][];
        LevelFilter: components["schemas"]["RiskLevel"][];
        StatusFilter: components["schemas"]["ScoreStatus"][];
        Query: string;
        MinScore: number;
        MaxScore: number;
        MinLoss: number;
        HasAnomalies: boolean;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getAuthProviders: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthProviders"];
                };
            };
        };
    };
    login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CurrentUser"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            422: components["responses"]["Unprocessable"];
        };
    };
    refresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CurrentUser"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    getCurrentUser: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CurrentUser"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    oidcLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            302: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            404: components["responses"]["NotFound"];
        };
    };
    oidcCallback: {
        parameters: {
            query?: {
                code?: string;
                state?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            302: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    listCustomers: {
        parameters: {
            query?: {
                page?: components["parameters"]["Page"];
                size?: components["parameters"]["Size"];
                sort?: components["parameters"]["CustomerSort"];
                fields?: components["parameters"]["CustomerFields"];
                level?: components["parameters"]["LevelFilter"];
                status?: components["parameters"]["StatusFilter"];
                q?: components["parameters"]["Query"];
                minScore?: components["parameters"]["MinScore"];
                maxScore?: components["parameters"]["MaxScore"];
                minLoss?: components["parameters"]["MinLoss"];
                hasAnomalies?: components["parameters"]["HasAnomalies"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerPage"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    exportCustomers: {
        parameters: {
            query?: {
                sort?: components["parameters"]["CustomerSort"];
                fields?: components["parameters"]["CustomerFields"];
                level?: components["parameters"]["LevelFilter"];
                status?: components["parameters"]["StatusFilter"];
                q?: components["parameters"]["Query"];
                minScore?: components["parameters"]["MinScore"];
                maxScore?: components["parameters"]["MaxScore"];
                minLoss?: components["parameters"]["MinLoss"];
                hasAnomalies?: components["parameters"]["HasAnomalies"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/csv": string;
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
        };
    };
    getCustomer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerDetails"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
        };
    };
    getCustomerHistory: {
        parameters: {
            query?: {
                from?: string;
                to?: string;
                limit?: number;
            };
            header?: never;
            path: {
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScoreHistoryPoint"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
        };
    };
    getAnalyticsSummary: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsSummary"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    getChurnChart: {
        parameters: {
            query?: {
                pastDays?: number;
                futureDays?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChurnChart"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    getForecastComparison: {
        parameters: {
            query?: {
                pastDays?: number;
                futureDays?: number;
                includeMl?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForecastComparison"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
        };
    };
    getModelSettings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ModelSettings"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    updateModelSettings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ModelSettingsPatch"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ModelSettingsUpdated"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Unprocessable"];
        };
    };
    listModelRevisions: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ModelRevision"][];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    requestRecalc: {
        parameters: {
            query?: {
                scope?: "pending" | "all";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecalcAccepted"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    getRecalcStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecalcStatus"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    replaceSnapshot: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SnapshotInput"];
                "multipart/form-data": {
                    accounts: string;
                    services: string;
                    transactions: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IngestResult"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            413: components["responses"]["PayloadTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
            422: components["responses"]["Unprocessable"];
        };
    };
    listSourceAccounts: {
        parameters: {
            query?: {
                page?: components["parameters"]["Page"];
                size?: components["parameters"]["Size"];
                ids?: components["parameters"]["Ids"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    upsertAccounts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AccountInput"][];
                "text/csv": string;
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IngestResult"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            413: components["responses"]["PayloadTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
            422: components["responses"]["Unprocessable"];
        };
    };
    listSourceServices: {
        parameters: {
            query?: {
                page?: components["parameters"]["Page"];
                size?: components["parameters"]["Size"];
                ids?: components["parameters"]["Ids"];
                ownerId?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServicePage"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    upsertServices: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ServiceInput"][];
                "text/csv": string;
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IngestResult"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            413: components["responses"]["PayloadTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
            422: components["responses"]["Unprocessable"];
        };
    };
    listSourceTransactions: {
        parameters: {
            query?: {
                page?: components["parameters"]["Page"];
                size?: components["parameters"]["Size"];
                ids?: components["parameters"]["Ids"];
                serviceId?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    upsertTransactions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TransactionInput"][];
                "text/csv": string;
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IngestResult"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            413: components["responses"]["PayloadTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
            422: components["responses"]["Unprocessable"];
        };
    };
    listIngestLog: {
        parameters: {
            query?: {
                page?: components["parameters"]["Page"];
                size?: components["parameters"]["Size"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IngestLogPage"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    streamEvents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["LiveEvent"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    askAssistant: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssistantRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["AssistantEvent"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Unprocessable"];
            429: components["responses"]["TooManyRequests"];
            503: components["responses"]["AssistantDisabled"];
        };
    };
    listUsers: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    createUser: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserCreate"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["Unprocessable"];
        };
    };
    deleteUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
        };
    };
    updateUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserPatch"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["Unprocessable"];
        };
    };
    listApiKeys: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiKey"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    createApiKey: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ApiKeyCreate"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiKeyCreated"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Unprocessable"];
        };
    };
    revokeApiKey: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["IdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    getMetrics: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/plain": string;
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        status: "UP" | "DOWN";
                    };
                };
            };
        };
    };
}
