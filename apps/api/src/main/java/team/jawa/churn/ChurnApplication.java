package team.jawa.churn;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class ChurnApplication {

    public static void main(String[] args) {
        SpringApplication.run(ChurnApplication.class, args);
    }
}
