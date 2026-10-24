ARG BASE_REGISTRY=docker.io

FROM ${BASE_REGISTRY}/library/eclipse-temurin:25-jdk AS build
ARG GRADLE_MIRROR=
ENV GRADLE_MIRROR=${GRADLE_MIRROR}
WORKDIR /src/apps/api
COPY apps/api/gradlew apps/api/settings.gradle.kts apps/api/build.gradle.kts apps/api/gradle.properties ./
COPY apps/api/gradle gradle
RUN ./gradlew --no-daemon dependencies > /dev/null
COPY apps/api/src src
RUN ./gradlew --no-daemon bootJar -x test

FROM ${BASE_REGISTRY}/library/eclipse-temurin:25-jre
RUN useradd --system --uid 10001 --no-create-home churn
USER churn
WORKDIR /app
ENV JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=75
COPY --from=build /src/apps/api/build/libs/churn-api-0.0.1.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
