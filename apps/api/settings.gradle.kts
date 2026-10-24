pluginManagement {
    val mirror = providers.environmentVariable("GRADLE_MIRROR").orNull
    repositories {
        if (!mirror.isNullOrBlank()) {
            maven(url = mirror)
        }
        gradlePluginPortal()
        mavenCentral()
    }
}

plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "churn-api"
