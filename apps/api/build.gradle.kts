import org.springframework.boot.gradle.plugin.SpringBootPlugin

plugins {
    java
    id("org.springframework.boot") version "4.1.2"
    id("com.diffplug.spotless") version "8.10.4"
    id("org.openapi.generator") version "7.26.0"
}

group = "team.jawa"
version = "0.0.1"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    val mirror = providers.environmentVariable("GRADLE_MIRROR").orNull
    if (!mirror.isNullOrBlank()) {
        maven(url = mirror)
    }
    mavenCentral()
}

dependencies {
    implementation(platform(SpringBootPlugin.BOM_COORDINATES))

    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.security:spring-security-oauth2-jose")
    implementation("org.springframework.security:spring-security-oauth2-client")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.flywaydb:flyway-database-postgresql")
    implementation("io.micrometer:micrometer-registry-prometheus")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:3.1.1")
    runtimeOnly("org.postgresql:postgresql")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.testcontainers:testcontainers-junit-jupiter")
    testImplementation("org.testcontainers:testcontainers-postgresql")
    testImplementation("no.nav.security:mock-oauth2-server:2.2.1")
    testImplementation("org.postgresql:postgresql")
    testImplementation("io.swagger.parser.v3:swagger-parser:2.1.48")
    testRuntimeOnly("javax.xml.bind:jaxb-api:2.3.1")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

val openApiSpec = layout.projectDirectory.file("../../openapi.yaml")
val generatedDir = layout.buildDirectory.dir("generated")

openApiGenerate {
    generatorName = "spring"
    inputSpec = openApiSpec
    outputDir = generatedDir
    ignoreFileOverride = layout.projectDirectory.file(".openapi-generator-ignore")
    apiPackage = "team.jawa.churn.api.generated.api"
    modelPackage = "team.jawa.churn.api.generated.model"
    globalProperties = mapOf("apis" to "", "models" to "", "apiTests" to "false", "modelTests" to "false")
    configOptions = mapOf(
        "interfaceOnly" to "true",
        "useSpringBoot4" to "true",
        "useJackson3" to "true",
        "useTags" to "true",
        "skipDefaultInterface" to "true",
        "openApiNullable" to "false",
        "useBeanValidation" to "true",
        "documentationProvider" to "none",
    )
}

sourceSets {
    main {
        java.srcDir(generatedDir.map { it.dir("src/main/java") })
    }
}

tasks.compileJava {
    dependsOn(tasks.openApiGenerate)
}

tasks.processResources {
    from(openApiSpec) {
        into("static/api/v1")
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
}

spotless {
    java {
        palantirJavaFormat()
        target("src/**/*.java")
    }
}

tasks.bootRun {
    systemProperty("spring.profiles.active", "dev")
}
