pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "antigravity-android"

include(":core-contract")
include(":core-engine")
// Phase 2+
// include(":data")
// include(":feature-home")
// include(":feature-widget-notification")
